pub const FRAME_MS: u64 = 16;
pub const MAX_FRAME_BUFFER: usize = 64 * 1024;

pub struct FrameAggregator {
    pending: Vec<u8>,
    max_buffer: usize,
}

impl FrameAggregator {
    pub fn new() -> Self {
        Self {
            pending: Vec::with_capacity(MAX_FRAME_BUFFER),
            max_buffer: MAX_FRAME_BUFFER,
        }
    }

    #[cfg(test)]
    fn with_max_buffer(max_buffer: usize) -> Self {
        Self {
            pending: Vec::with_capacity(max_buffer),
            max_buffer,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) -> Option<Vec<u8>> {
        self.pending.extend_from_slice(bytes);
        if self.pending.len() >= self.max_buffer {
            return self.flush();
        }
        None
    }

    pub fn flush(&mut self) -> Option<Vec<u8>> {
        if self.pending.is_empty() {
            return None;
        }
        Some(std::mem::take(&mut self.pending))
    }
}

#[cfg(test)]
mod tests {
    use super::FrameAggregator;

    #[test]
    fn buffers_until_the_size_threshold() {
        let mut frames = FrameAggregator::with_max_buffer(8);

        assert!(frames.push(b"abc").is_none());
        assert_eq!(frames.push(b"defgh").as_deref(), Some(&b"abcdefgh"[..]));
        assert!(frames.flush().is_none());
    }

    #[test]
    fn flushes_partial_frames_on_tick_or_eof() {
        let mut frames = FrameAggregator::with_max_buffer(8);

        assert!(frames.push(b"abc").is_none());
        assert_eq!(frames.flush().as_deref(), Some(&b"abc"[..]));
        assert!(frames.flush().is_none());
    }

    #[test]
    fn sends_large_chunks_as_one_frame_without_splitting_bytes() {
        let mut frames = FrameAggregator::with_max_buffer(8);

        assert_eq!(
            frames.push(b"abcdefghijkl").as_deref(),
            Some(&b"abcdefghijkl"[..])
        );
        assert!(frames.flush().is_none());
    }
}
