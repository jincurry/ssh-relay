use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigFile {
    path: String,
    content: String,
}

#[tauri::command]
pub fn read_default_ssh_config() -> Result<Option<SshConfigFile>, String> {
    read_default_ssh_config_inner().map_err(|err| err.to_string())
}

fn read_default_ssh_config_inner() -> Result<Option<SshConfigFile>> {
    let Some(path) = default_ssh_config_path() else {
        return Ok(None);
    };

    if !path.exists() {
        return Ok(None);
    }

    let home = home_dir();
    let content = read_ssh_config_with_includes(&path, home.as_deref())?;
    Ok(Some(SshConfigFile {
        path: path.to_string_lossy().to_string(),
        content,
    }))
}

fn read_ssh_config_with_includes(path: &Path, home: Option<&Path>) -> Result<String> {
    let mut visited = HashSet::new();
    read_ssh_config_with_includes_inner(path, home, &mut visited, 0)
}

fn read_ssh_config_with_includes_inner(
    path: &Path,
    home: Option<&Path>,
    visited: &mut HashSet<PathBuf>,
    depth: usize,
) -> Result<String> {
    anyhow::ensure!(depth <= 16, "ssh config Include nesting is too deep");

    let key = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if !visited.insert(key) {
        return Ok(String::new());
    }

    let content =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut expanded = String::new();

    for raw_line in content.lines() {
        if let Some(patterns) = include_patterns(raw_line) {
            for pattern in patterns {
                for include_path in expand_include_pattern(&pattern, base_dir, home)? {
                    expanded.push_str(&read_ssh_config_with_includes_inner(
                        &include_path,
                        home,
                        visited,
                        depth + 1,
                    )?);
                    if !expanded.ends_with('\n') {
                        expanded.push('\n');
                    }
                }
            }
        } else {
            expanded.push_str(raw_line);
            expanded.push('\n');
        }
    }

    Ok(expanded)
}

fn include_patterns(line: &str) -> Option<Vec<String>> {
    let words = split_shell_words(strip_comment(line).trim());
    let (keyword, args) = parse_directive(&words)?;
    if !keyword.eq_ignore_ascii_case("include") || args.is_empty() {
        return None;
    }
    Some(args)
}

fn parse_directive(words: &[String]) -> Option<(String, Vec<String>)> {
    let first = words.first()?;

    if let Some(index) = first.find('=') {
        if index > 0 {
            let keyword = first[..index].to_string();
            let inline = first[index + 1..].to_string();
            let mut args = Vec::new();
            if !inline.is_empty() {
                args.push(inline);
            }
            args.extend(words.iter().skip(1).cloned());
            return Some((keyword, args));
        }
    }

    let rest = &words[1..];
    if rest.first().is_some_and(|word| word == "=") {
        return Some((first.clone(), rest[1..].to_vec()));
    }

    if let Some(value) = rest.first().and_then(|word| word.strip_prefix('=')) {
        let mut args = Vec::new();
        if !value.is_empty() {
            args.push(value.to_string());
        }
        args.extend(rest.iter().skip(1).cloned());
        return Some((first.clone(), args));
    }

    Some((first.clone(), rest.to_vec()))
}

fn expand_include_pattern(
    pattern: &str,
    base_dir: &Path,
    home: Option<&Path>,
) -> Result<Vec<PathBuf>> {
    let path = expand_user_path(pattern, home);
    let path = if path.is_absolute() {
        path
    } else {
        base_dir.join(path)
    };

    let mut matches = if contains_glob_meta(&path) {
        expand_glob_path(&path)?
    } else if path.is_file() {
        vec![path]
    } else {
        Vec::new()
    };
    matches.sort();
    Ok(matches)
}

fn expand_user_path(pattern: &str, home: Option<&Path>) -> PathBuf {
    if let Some(rest) = pattern.strip_prefix("~/") {
        if let Some(home) = home {
            return home.join(rest);
        }
    }
    PathBuf::from(pattern)
}

fn contains_glob_meta(path: &Path) -> bool {
    path.to_string_lossy()
        .chars()
        .any(|ch| ch == '*' || ch == '?')
}

fn expand_glob_path(pattern: &Path) -> Result<Vec<PathBuf>> {
    let mut roots = vec![PathBuf::new()];

    for component in pattern.components() {
        match component {
            Component::Prefix(_)
            | Component::RootDir
            | Component::CurDir
            | Component::ParentDir => {
                for root in &mut roots {
                    root.push(component.as_os_str());
                }
            }
            Component::Normal(segment) => {
                let segment = segment.to_string_lossy().to_string();
                if segment.chars().any(|ch| ch == '*' || ch == '?') {
                    let mut next = Vec::new();
                    for root in &roots {
                        let dir = if root.as_os_str().is_empty() {
                            Path::new(".")
                        } else {
                            root.as_path()
                        };
                        if !dir.is_dir() {
                            continue;
                        }
                        for entry in fs::read_dir(dir)
                            .with_context(|| format!("failed to list {}", dir.display()))?
                        {
                            let entry = entry?;
                            let name = entry.file_name().to_string_lossy().to_string();
                            if wildcard_matches(&segment, &name) {
                                next.push(root.join(entry.file_name()));
                            }
                        }
                    }
                    roots = next;
                } else {
                    for root in &mut roots {
                        root.push(&segment);
                    }
                }
            }
        }
    }

    Ok(roots.into_iter().filter(|path| path.is_file()).collect())
}

fn wildcard_matches(pattern: &str, text: &str) -> bool {
    let pattern: Vec<char> = pattern.chars().collect();
    let text: Vec<char> = text.chars().collect();
    let mut dp = vec![vec![false; text.len() + 1]; pattern.len() + 1];
    dp[0][0] = true;

    for i in 1..=pattern.len() {
        if pattern[i - 1] == '*' {
            dp[i][0] = dp[i - 1][0];
        }
    }

    for i in 1..=pattern.len() {
        for j in 1..=text.len() {
            dp[i][j] = match pattern[i - 1] {
                '*' => dp[i - 1][j] || dp[i][j - 1],
                '?' => dp[i - 1][j - 1],
                ch => ch == text[j - 1] && dp[i - 1][j - 1],
            };
        }
    }

    dp[pattern.len()][text.len()]
}

fn strip_comment(line: &str) -> String {
    let mut quote = None;
    let mut out = String::new();
    let mut escaped = false;

    for ch in line.chars() {
        if escaped {
            out.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            out.push(ch);
            escaped = true;
            continue;
        }
        if (ch == '"' || ch == '\'') && quote.is_none_or(|current| current == ch) {
            quote = if quote == Some(ch) { None } else { Some(ch) };
            out.push(ch);
            continue;
        }
        if ch == '#' && quote.is_none() {
            break;
        }
        out.push(ch);
    }

    out
}

fn split_shell_words(line: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut quote = None;

    let chars: Vec<char> = line.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if ch == '\\' {
            if let Some(next) = chars.get(index + 1) {
                if should_unescape_ssh_config_char(*next) {
                    current.push(*next);
                    index += 2;
                    continue;
                }
            }
            current.push(ch);
            index += 1;
            continue;
        }
        if (ch == '"' || ch == '\'') && quote.is_none_or(|current| current == ch) {
            quote = if quote == Some(ch) { None } else { Some(ch) };
            index += 1;
            continue;
        }
        if ch.is_whitespace() && quote.is_none() {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            index += 1;
            continue;
        }
        current.push(ch);
        index += 1;
    }

    if !current.is_empty() {
        words.push(current);
    }
    words
}

fn should_unescape_ssh_config_char(ch: char) -> bool {
    ch.is_whitespace() || ch == '\\' || ch == '"' || ch == '\'' || ch == '#'
}

fn default_ssh_config_path() -> Option<PathBuf> {
    home_dir().map(|home| ssh_config_path_for_home(&home))
}

fn ssh_config_path_for_home(home: &Path) -> PathBuf {
    home.join(".ssh").join("config")
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_default_ssh_config_path_from_home() {
        assert_eq!(
            ssh_config_path_for_home(Path::new("/home/alice")),
            PathBuf::from("/home/alice/.ssh/config")
        );
    }

    #[test]
    fn reads_config_file_when_present() {
        let root =
            std::env::temp_dir().join(format!("relay-ssh-config-test-{}", std::process::id()));
        let ssh_dir = root.join(".ssh");
        let path = ssh_config_path_for_home(&root);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&ssh_dir).expect("create .ssh");
        fs::write(&path, "Host demo\n  HostName 127.0.0.1\n").expect("write config");

        let content = fs::read_to_string(ssh_config_path_for_home(&root)).expect("read config");
        assert!(content.contains("Host demo"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn expands_default_config_include_files_in_order() {
        let root = std::env::temp_dir().join(format!(
            "relay-ssh-config-include-test-{}",
            std::process::id()
        ));
        let ssh_dir = root.join(".ssh");
        let conf_dir = ssh_dir.join("conf.d");
        let main_path = ssh_config_path_for_home(&root);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&conf_dir).expect("create conf.d");
        fs::write(
            &main_path,
            "Include conf.d/*.conf\nHost main\n  HostName 127.0.0.1\n",
        )
        .expect("write main config");
        fs::write(
            conf_dir.join("01-bastion.conf"),
            "Host bastion\n  HostName 192.0.2.10\n",
        )
        .expect("write first include");
        fs::write(
            conf_dir.join("02-db.conf"),
            "Host db\n  HostName 192.0.2.20\n",
        )
        .expect("write second include");

        let content =
            read_ssh_config_with_includes(&main_path, Some(&root)).expect("read expanded config");

        let bastion = content.find("Host bastion").expect("bastion included");
        let db = content.find("Host db").expect("db included");
        let main = content.find("Host main").expect("main retained");
        assert!(bastion < db);
        assert!(db < main);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn expands_tilde_includes_and_avoids_recursive_cycles() {
        let root = std::env::temp_dir().join(format!(
            "relay-ssh-config-cycle-test-{}",
            std::process::id()
        ));
        let ssh_dir = root.join(".ssh");
        let main_path = ssh_config_path_for_home(&root);
        let extra_path = ssh_dir.join("extra.conf");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&ssh_dir).expect("create .ssh");
        fs::write(
            &main_path,
            "Include ~/.ssh/extra.conf\nHost main\n  HostName 127.0.0.1\n",
        )
        .expect("write main config");
        fs::write(
            &extra_path,
            "Include ~/.ssh/config\nHost extra\n  HostName 192.0.2.30\n",
        )
        .expect("write recursive include");

        let content =
            read_ssh_config_with_includes(&main_path, Some(&root)).expect("read expanded config");

        assert_eq!(content.matches("Host main").count(), 1);
        assert_eq!(content.matches("Host extra").count(), 1);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn expands_escaped_include_paths_without_corrupting_plain_backslashes() {
        let root = std::env::temp_dir().join(format!(
            "relay-ssh-config-escaped-include-test-{}",
            std::process::id()
        ));
        let ssh_dir = root.join(".ssh");
        let conf_dir = ssh_dir.join("conf dir");
        let literal_hash = ssh_dir.join("literal#hash.conf");
        let main_path = ssh_config_path_for_home(&root);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&conf_dir).expect("create escaped include dir");
        fs::write(
            &main_path,
            "Include conf\\ dir/*.conf literal\\#hash.conf\nHost main\n  HostName 127.0.0.1\n",
        )
        .expect("write main config");
        fs::write(
            conf_dir.join("01-space.conf"),
            "Host spaced-include\n  HostName 192.0.2.40\n",
        )
        .expect("write escaped space include");
        fs::write(&literal_hash, "Host hash-include\n  HostName 192.0.2.41\n")
            .expect("write escaped hash include");

        let content =
            read_ssh_config_with_includes(&main_path, Some(&root)).expect("read expanded config");

        assert!(content.contains("Host spaced-include"));
        assert!(content.contains("Host hash-include"));
        assert!(content.contains("Host main"));
        assert_eq!(
            split_shell_words(r#"Include C:\Users\deploy\.ssh\config.d\*.conf"#),
            vec![
                "Include".to_string(),
                r#"C:\Users\deploy\.ssh\config.d\*.conf"#.to_string()
            ]
        );

        fs::remove_dir_all(root).expect("cleanup");
    }
}
