use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ProxyValidationRequest {
    kind: String,
    host: Option<String>,
    port: Option<String>,
    cmd: Option<String>,
}

#[derive(Serialize)]
pub struct ProxyValidation {
    ok: bool,
    message: String,
}

#[tauri::command]
pub fn validate_proxy(req: ProxyValidationRequest) -> ProxyValidation {
    match req.kind.as_str() {
        "none" => ok("direct connection"),
        "socks5" | "http" => {
            if req.host.as_deref().unwrap_or("").is_empty()
                || req.port.as_deref().unwrap_or("").is_empty()
            {
                fail("proxy host and port are required")
            } else {
                ok("proxy settings look valid")
            }
        }
        "cmd" => {
            let cmd = req.cmd.unwrap_or_default();
            if cmd.contains("%h") && cmd.contains("%p") {
                ok("ProxyCommand placeholders are present")
            } else {
                fail("ProxyCommand must include %h and %p")
            }
        }
        _ => fail("unknown proxy type"),
    }
}

fn ok(message: &str) -> ProxyValidation {
    ProxyValidation {
        ok: true,
        message: message.to_string(),
    }
}

fn fail(message: &str) -> ProxyValidation {
    ProxyValidation {
        ok: false,
        message: message.to_string(),
    }
}
