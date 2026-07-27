//! Incremental Server-Sent Events parsing.
//!
//! Upstream HTTP chunks are arbitrary byte ranges: one SSE event can span
//! multiple chunks, and a chunk can contain multiple events. This decoder
//! frames events before protocol-specific JSON parsing so converters never
//! assume that a network chunk is a complete line or JSON object.

use super::ConversionError;
use super::ProtocolKind;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseFrame {
    pub event: Option<String>,
    pub data: String,
}

#[derive(Debug, Default)]
pub struct SseDecoder {
    buffer: Vec<u8>,
}

#[derive(Debug)]
pub struct StreamConverter {
    source: ProtocolKind,
    target: ProtocolKind,
    decoder: SseDecoder,
    id: String,
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    completed: bool,
    content_started: bool,
    started_tools: HashSet<u64>,
    /// Anthropic 目标协议下已开启的 thinking 内容块索引（未关闭时为 Some）。
    thinking_block: Option<u64>,
    /// Anthropic 目标协议下已开启的 text 内容块索引（未关闭时为 Some）。
    text_block: Option<u64>,
    /// 下一个可用的 Anthropic 内容块索引。
    next_block: u64,
    /// 标记是否曾经开启过 text 块。一旦为 true，
    /// 后续的 reasoning 不再创建新的 thinking 块，
    /// 而是作为 text_delta 追加到 text 块中。
    text_started_once: bool,
    /// Responses 目标协议下 message 输出项是否已开启。
    responses_msg_started: bool,
    /// Responses 目标协议下 reasoning 输出项是否已开启。
    responses_reasoning_started: bool,
    /// Responses 目标协议下 message 输出项的 output_index。
    responses_msg_index: u64,
    /// Responses 目标协议下 reasoning 输出项的 output_index。
    responses_reasoning_index: u64,
    /// Responses 目标协议下累积的文本内容（用于完成事件）。
    responses_text_buf: String,
    /// Responses 目标协议下累积的推理内容（用于完成事件中填充空消息）。
    responses_reasoning_buf: String,
    /// Responses 目标协议下 tool call 参数累积（output_index → arguments 字符串）。
    responses_tool_args: HashMap<u64, String>,
    /// Responses 目标协议下 tool call 的 item_id（output_index → item_id）。
    responses_tool_ids: HashMap<u64, String>,
    /// Responses 目标协议下 tool call 的 call_id（上游 tool index → call_id）。
    responses_tool_call_ids: HashMap<u64, String>,
    /// Responses 目标协议下 tool call 的名称（上游 tool index → name）。
    responses_tool_names: HashMap<u64, String>,
    /// 上游 tool index 到 Responses output_index 的映射。
    responses_tool_output_indices: HashMap<u64, u64>,
    /// 已完成的 Responses 输出项，按 output_index 保持原始顺序。
    responses_completed_items: BTreeMap<u64, Value>,
    /// Anthropic → Responses 转换中，content_block index 到 item_id 的映射。
    anthropic_tool_item_ids: HashMap<u64, String>,
}

pub fn supports_stream_conversion(source: ProtocolKind, target: ProtocolKind) -> bool {
    matches!(
        source,
        ProtocolKind::OpenAiChat
            | ProtocolKind::AnthropicMessages
            | ProtocolKind::OpenAiResponses
    ) && matches!(
        target,
        ProtocolKind::OpenAiChat
            | ProtocolKind::AnthropicMessages
            | ProtocolKind::OpenAiResponses
    )
}

impl StreamConverter {
    pub fn new(source: ProtocolKind, target: ProtocolKind) -> Self {
        Self {
            source,
            target,
            decoder: SseDecoder::new(),
            id: String::new(),
            model: String::new(),
            input_tokens: 0,
            output_tokens: 0,
            completed: false,
            content_started: false,
            started_tools: HashSet::new(),
            thinking_block: None,
            text_block: None,
            next_block: 0,
            text_started_once: false,
            responses_msg_started: false,
            responses_reasoning_started: false,
            responses_msg_index: 0,
            responses_reasoning_index: 0,
            responses_text_buf: String::new(),
            responses_reasoning_buf: String::new(),
            responses_tool_args: HashMap::new(),
            responses_tool_ids: HashMap::new(),
            responses_tool_call_ids: HashMap::new(),
            responses_tool_names: HashMap::new(),
            responses_tool_output_indices: HashMap::new(),
            responses_completed_items: BTreeMap::new(),
            anthropic_tool_item_ids: HashMap::new(),
        }
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<u8>, ConversionError> {
        if self.source == self.target {
            return Ok(bytes.to_vec());
        }
        let frames = self.decoder.push(bytes)?;
        let mut output = Vec::new();
        for frame in frames {
            match (self.source, self.target) {
                (ProtocolKind::AnthropicMessages, ProtocolKind::OpenAiChat) => {
                    self.anthropic_to_openai_chat(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiChat, ProtocolKind::AnthropicMessages) => {
                    self.openai_chat_to_anthropic(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiChat, ProtocolKind::OpenAiResponses) => {
                    self.openai_chat_to_responses(frame, &mut output)?;
                }
                (ProtocolKind::AnthropicMessages, ProtocolKind::OpenAiResponses) => {
                    self.anthropic_to_responses(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiResponses, ProtocolKind::OpenAiChat) => {
                    self.responses_to_openai_chat(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiResponses, ProtocolKind::AnthropicMessages) => {
                    self.responses_to_anthropic(frame, &mut output)?;
                }
                _ => {
                    unreachable!("same-protocol streams return before conversion")
                }
            }
        }
        Ok(output)
    }

    pub fn finish(&mut self) -> Result<Vec<u8>, ConversionError> {
        if self.source == self.target {
            return Ok(Vec::new());
        }
        let frames = self.decoder.finish()?;
        eprintln!(
            "[stream] finish() called: source={:?} target={:?} completed={} content_started={} msg_started={} reasoning_started={} text_buf_len={} reasoning_buf_len={} leftover_frames={}",
            self.source, self.target, self.completed, self.content_started,
            self.responses_msg_started, self.responses_reasoning_started,
            self.responses_text_buf.len(), self.responses_reasoning_buf.len(),
            frames.len()
        );
        let mut output = Vec::new();
        for frame in frames {
            match (self.source, self.target) {
                (ProtocolKind::AnthropicMessages, ProtocolKind::OpenAiChat) => {
                    self.anthropic_to_openai_chat(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiChat, ProtocolKind::AnthropicMessages) => {
                    self.openai_chat_to_anthropic(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiChat, ProtocolKind::OpenAiResponses) => {
                    self.openai_chat_to_responses(frame, &mut output)?;
                }
                (ProtocolKind::AnthropicMessages, ProtocolKind::OpenAiResponses) => {
                    self.anthropic_to_responses(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiResponses, ProtocolKind::OpenAiChat) => {
                    self.responses_to_openai_chat(frame, &mut output)?;
                }
                (ProtocolKind::OpenAiResponses, ProtocolKind::AnthropicMessages) => {
                    self.responses_to_anthropic(frame, &mut output)?;
                }
                _ => {}
            }
        }
        // If the stream ended without a proper terminal event
        // (some providers omit finish_reason), ensure the client
        // receives a clean lifecycle completion.
        if !self.completed
            && (self.content_started
                || self.responses_msg_started
                || self.responses_reasoning_started)
        {
            eprintln!(
                "[stream] finish() synthesizing terminal event for {:?}",
                self.target
            );
            match self.target {
                ProtocolKind::OpenAiResponses => {
                    self.finish_responses("completed", &mut output)?;
                }
                ProtocolKind::AnthropicMessages => {
                    self.finish_anthropic("end_turn", &mut output)?;
                }
                _ => {}
            }
        }
        eprintln!("[stream] finish() done, output_len={}", output.len());
        Ok(output)
    }

    /// 确保已开启 thinking 内容块，返回其索引及是否为 thinking 块。
    /// 若 text 内容块仍开启则先关闭它（thinking 应排在 text 之前）。
    /// 但一旦 text 块曾经开启过，就不再回到 thinking，
    /// 后续 reasoning 将作为 text_delta 追加到 text 块。
    fn ensure_thinking_block(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(u64, bool), ConversionError> {
        // 一旦曾经输出过 text，就不再创建新的 thinking 块，
        // 而是将后续 reasoning 内容合并到 text 块中。
        if self.text_started_once {
            let idx = self.ensure_text_block(output)?;
            return Ok((idx, false));
        }
        if let Some(idx) = self.thinking_block {
            return Ok((idx, true));
        }
        if let Some(idx) = self.text_block.take() {
            append_event(
                output,
                "content_block_stop",
                &json!({"type":"content_block_stop","index":idx}),
            )?;
        }
        let index = self.next_block;
        self.next_block += 1;
        self.thinking_block = Some(index);
        append_event(
            output,
            "content_block_start",
            &json!({"type":"content_block_start","index":index,"content_block":{"type":"thinking","thinking":""}}),
        )?;
        Ok((index, true))
    }

    /// 确保已开启 text 内容块，返回其索引。
    /// 若 thinking 内容块仍开启则先关闭它。
    fn ensure_text_block(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<u64, ConversionError> {
        if let Some(idx) = self.text_block {
            return Ok(idx);
        }
        if let Some(idx) = self.thinking_block.take() {
            append_event(
                output,
                "content_block_stop",
                &json!({"type":"content_block_stop","index":idx}),
            )?;
        }
        self.text_started_once = true;
        let index = self.next_block;
        self.next_block += 1;
        self.text_block = Some(index);
        append_event(
            output,
            "content_block_start",
            &json!({"type":"content_block_start","index":index,"content_block":{"type":"text","text":""}}),
        )?;
        Ok(index)
    }

    /// 关闭所有仍开启的 Anthropic 内容块（thinking / text）。
    fn close_open_blocks(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if let Some(idx) = self.thinking_block.take() {
            append_event(
                output,
                "content_block_stop",
                &json!({"type":"content_block_stop","index":idx}),
            )?;
        }
        if let Some(idx) = self.text_block.take() {
            append_event(
                output,
                "content_block_stop",
                &json!({"type":"content_block_stop","index":idx}),
            )?;
        }
        Ok(())
    }

    /// 确保 Responses 协议下已创建 message 输出项。
    /// 在发送 response.output_text.delta 之前必须调用，
    /// 否则 AI SDK 找不到对应的 text part。
    fn ensure_responses_message(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if self.responses_msg_started {
            return Ok(());
        }
        let index = self.next_block;
        self.next_block += 1;
        self.responses_msg_index = index;
        append_event(
            output,
            "response.output_item.added",
            &json!({
                "type": "response.output_item.added",
                "output_index": index,
                "item": {
                    "type": "message",
                    "id": "msg_melody",
                    "role": "assistant",
                    "status": "in_progress",
                    "content": []
                }
            }),
        )?;
        append_event(
            output,
            "response.content_part.added",
            &json!({
                "type": "response.content_part.added",
                "item_id": "msg_melody",
                "output_index": index,
                "content_index": 0,
                "part": {
                    "type": "output_text",
                    "text": ""
                }
            }),
        )?;
        self.responses_msg_started = true;
        Ok(())
    }

    /// 确保 Responses 协议下已创建 reasoning 输出项。
    fn ensure_responses_reasoning(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if self.responses_reasoning_started {
            return Ok(());
        }
        let index = self.next_block;
        self.next_block += 1;
        self.responses_reasoning_index = index;
        append_event(
            output,
            "response.output_item.added",
            &json!({
                "type": "response.output_item.added",
                "output_index": index,
                "item": {
                    "type": "reasoning",
                    "id": "rs_melody",
                    "summary": [],
                    "status": "in_progress"
                }
            }),
        )?;
        append_event(
            output,
            "response.reasoning_summary_part.added",
            &json!({
                "type": "response.reasoning_summary_part.added",
                "item_id": "rs_melody",
                "output_index": index,
                "summary_index": 0
            }),
        )?;
        self.responses_reasoning_started = true;
        Ok(())
    }

    /// Finalise the Responses message output item (text).
    /// If no text content was streamed, the accumulated reasoning
    /// text is used as fallback so the client always sees content.
    fn finalize_responses_text(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let mut text = std::mem::take(&mut self.responses_text_buf);
        // Fall back to reasoning text when the model only emitted
        // thinking content and no visible text (DeepSeek, etc.).
        if text.is_empty() && !self.responses_reasoning_buf.is_empty() {
            text = std::mem::take(&mut self.responses_reasoning_buf);
        }
        if !self.responses_msg_started {
            let index = self.next_block;
            self.next_block += 1;
            self.responses_msg_index = index;
            append_event(
                output,
                "response.output_item.added",
                &json!({
                    "type": "response.output_item.added",
                    "output_index": index,
                    "item": {
                        "type": "message",
                        "id": "msg_melody",
                        "role": "assistant",
                        "status": "in_progress",
                        "content": []
                    }
                }),
            )?;
            append_event(
                output,
                "response.content_part.added",
                &json!({
                    "type": "response.content_part.added",
                    "item_id": "msg_melody",
                    "output_index": index,
                    "content_index": 0,
                    "part": {
                        "type": "output_text",
                        "text": ""
                    }
                }),
            )?;
            self.responses_msg_started = true;
        }
        let idx = self.responses_msg_index;
        append_event(
            output,
            "response.output_text.done",
            &json!({
                "type": "response.output_text.done",
                "item_id": "msg_melody",
                "output_index": idx,
                "content_index": 0,
                "text": text
            }),
        )?;
        append_event(
            output,
            "response.content_part.done",
            &json!({
                "type": "response.content_part.done",
                "item_id": "msg_melody",
                "output_index": idx,
                "content_index": 0,
                "part": {
                    "type": "output_text",
                    "text": text
                }
            }),
        )?;
        let item = json!({
            "type": "message",
            "id": "msg_melody",
            "role": "assistant",
            "status": "completed",
            "content": [{
                "type": "output_text",
                "text": text
            }]
        });
        append_event(
            output,
            "response.output_item.done",
            &json!({
                "type": "response.output_item.done",
                "output_index": idx,
                "item": item
            }),
        )?;
        self.responses_completed_items.insert(idx, item);
        self.responses_msg_started = false;
        Ok(())
    }

    /// Finalise the Responses reasoning output item.
    fn finalize_responses_reasoning(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if !self.responses_reasoning_started {
            return Ok(());
        }
        let idx = self.responses_reasoning_index;
        let text = std::mem::take(&mut self.responses_reasoning_buf);
        append_event(
            output,
            "response.reasoning_summary_part.done",
            &json!({
                "type": "response.reasoning_summary_part.done",
                "item_id": "rs_melody",
                "output_index": idx,
                "summary_index": 0
            }),
        )?;
        let item = json!({
            "type": "reasoning",
            "id": "rs_melody",
            "summary": [
                {"type": "summary_text", "text": text}
            ],
            "status": "completed"
        });
        append_event(
            output,
            "response.output_item.done",
            &json!({
                "type": "response.output_item.done",
                "output_index": idx,
                "item": item
            }),
        )?;
        self.responses_completed_items.insert(idx, item);
        self.responses_reasoning_started = false;
        Ok(())
    }

    /// Close all open Responses output items (text + reasoning + tools).
    fn close_responses_items(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        // A tool-only response must not gain a fabricated empty message.
        // Reasoning-only responses still get a text fallback so clients
        // that do not render reasoning have something visible.
        if self.responses_msg_started
            || (!self.responses_reasoning_buf.is_empty()
                && self.started_tools.is_empty())
        {
            self.finalize_responses_text(output)?;
        }
        self.finalize_responses_reasoning(output)?;
        self.close_tool_call_items(output)?;
        Ok(())
    }

    /// Close all open function_call output items by sending
    /// `response.function_call_arguments.done` and `response.output_item.done`.
    /// The AI SDK requires explicit closure of every output item
    /// before `response.completed`.
    fn close_tool_call_items(
        &mut self,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let mut indices: Vec<u64> = self.started_tools.iter().copied().collect();
        indices.sort_unstable_by_key(|index| {
            self.responses_tool_output_indices
                .get(index)
                .copied()
                .unwrap_or(u64::MAX)
        });
        for index in indices {
            let args = self.responses_tool_args.remove(&index).unwrap_or_default();
            let item_id = self
                .responses_tool_ids
                .remove(&index)
                .unwrap_or_else(|| format!("fc_call_melody_{index}"));
            let call_id = self
                .responses_tool_call_ids
                .remove(&index)
                .unwrap_or_else(|| format!("call_melody_{index}"));
            let name = self
                .responses_tool_names
                .remove(&index)
                .unwrap_or_else(|| "tool".to_string());
            let output_index = self
                .responses_tool_output_indices
                .remove(&index)
                .unwrap_or(index);
            append_event(
                output,
                "response.function_call_arguments.done",
                &json!({
                    "type": "response.function_call_arguments.done",
                    "item_id": item_id,
                    "output_index": output_index,
                    "arguments": args
                }),
            )?;
            let item = json!({
                "type": "function_call",
                "id": item_id,
                "call_id": call_id,
                "name": name,
                "arguments": args,
                "status": "completed"
            });
            append_event(
                output,
                "response.output_item.done",
                &json!({
                    "type": "response.output_item.done",
                    "output_index": output_index,
                    "item": item
                }),
            )?;
            self.responses_completed_items.insert(output_index, item);
        }
        self.started_tools.clear();
        Ok(())
    }

    fn anthropic_to_openai_chat(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let value: Value = serde_json::from_str(&frame.data).map_err(|error| {
            ConversionError::invalid(
                "stream",
                "$.data",
                format!("invalid Anthropic event JSON: {error}"),
            )
        })?;
        let event_type = frame
            .event
            .as_deref()
            .or_else(|| value.get("type").and_then(Value::as_str))
            .unwrap_or_default();
        match event_type {
            "message_start" => {
                self.id = value
                    .pointer("/message/id")
                    .and_then(Value::as_str)
                    .unwrap_or("chatcmpl-melody")
                    .to_string();
                self.model = value
                    .pointer("/message/model")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                self.input_tokens = value
                    .pointer("/message/usage/input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {"role": "assistant"},
                            "finish_reason": Value::Null,
                        }]
                    }),
                )?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("text_delta") =>
            {
                let text = value
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {"content": text},
                            "finish_reason": Value::Null,
                        }]
                    }),
                )?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("thinking_delta") =>
            {
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {"reasoning_content": value.pointer("/delta/thinking").and_then(Value::as_str).unwrap_or_default()},
                            "finish_reason": Value::Null,
                        }]
                    }),
                )?;
            }
            "content_block_start"
                if value.pointer("/content_block/type").and_then(Value::as_str)
                    == Some("tool_use") =>
            {
                let index = value.get("index").and_then(Value::as_u64).unwrap_or(0);
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {"tool_calls":[{
                                "index": index,
                                "id": value.pointer("/content_block/id").and_then(Value::as_str).unwrap_or("tool_melody"),
                                "type": "function",
                                "function": {
                                    "name": value.pointer("/content_block/name").and_then(Value::as_str).unwrap_or("tool"),
                                    "arguments": ""
                                }
                            }]},
                            "finish_reason": Value::Null,
                        }]
                    }),
                )?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("input_json_delta") =>
            {
                let index = value.get("index").and_then(Value::as_u64).unwrap_or(0);
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {"tool_calls":[{
                                "index": index,
                                "function": {
                                    "arguments": value.pointer("/delta/partial_json").and_then(Value::as_str).unwrap_or_default()
                                }
                            }]},
                            "finish_reason": Value::Null,
                        }]
                    }),
                )?;
            }
            "message_delta" => {
                self.output_tokens = value
                    .pointer("/usage/output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(self.output_tokens);
                let finish_reason =
                    match value.pointer("/delta/stop_reason").and_then(Value::as_str) {
                        Some("max_tokens") => "length",
                        Some("tool_use") => "tool_calls",
                        Some("refusal") => "content_filter",
                        _ => "stop",
                    };
                append_data(
                    output,
                    &json!({
                        "id": self.id,
                        "object": "chat.completion.chunk",
                        "created": 0,
                        "model": self.model,
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": finish_reason,
                        }],
                        "usage": {
                            "prompt_tokens": self.input_tokens,
                            "completion_tokens": self.output_tokens,
                            "total_tokens": self.input_tokens + self.output_tokens,
                        }
                    }),
                )?;
                output.extend_from_slice(b"data: [DONE]\n\n");
                self.completed = true;
            }
            "error" => {
                return Err(ConversionError::invalid(
                    "stream",
                    "$.error",
                    value
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Anthropic stream error"),
                ));
            }
            _ => {}
        }
        Ok(())
    }

    fn openai_chat_to_anthropic(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if frame.data == "[DONE]" {
            if !self.completed {
                self.finish_anthropic("end_turn", output)?;
            }
            return Ok(());
        }
        let value = parse_json_frame(&frame, "OpenAI Chat")?;
        self.capture_openai_metadata(&value);
        if !self.content_started {
            append_event(
                output,
                "message_start",
                &json!({
                    "type": "message_start",
                    "message": {
                        "id": non_empty(&self.id, "msg_melody"),
                        "type": "message",
                        "role": "assistant",
                        "model": non_empty(&self.model, "unknown"),
                        "content": [],
                        "stop_reason": Value::Null,
                        "stop_sequence": Value::Null,
                        "usage": {"input_tokens": self.input_tokens, "output_tokens": 0}
                    }
                }),
            )?;
            self.content_started = true;
        }
        // 先处理 reasoning（思考应在回答之前），再处理 content。
        // 这避免了同一 chunk 中两者同时存在时产生 thinking → text → thinking 交替。
        if let Some(reasoning) = value
            .pointer("/choices/0/delta/reasoning_content")
            .or_else(|| value.pointer("/choices/0/delta/reasoning"))
            .and_then(Value::as_str)
        {
            let (idx, is_thinking) = self.ensure_thinking_block(output)?;
            if is_thinking {
                append_event(
                    output,
                    "content_block_delta",
                    &json!({"type":"content_block_delta","index":idx,"delta":{"type":"thinking_delta","thinking":reasoning}}),
                )?;
            } else {
                // text 已开始，reasoning 合并到 text 块。
                append_event(
                    output,
                    "content_block_delta",
                    &json!({"type":"content_block_delta","index":idx,"delta":{"type":"text_delta","text":reasoning}}),
                )?;
            }
        }
        if let Some(text) = value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
        {
            let idx = self.ensure_text_block(output)?;
            append_event(
                output,
                "content_block_delta",
                &json!({"type":"content_block_delta","index":idx,"delta":{"type":"text_delta","text":text}}),
            )?;
        }
        if let Some(tool_calls) = value
            .pointer("/choices/0/delta/tool_calls")
            .and_then(Value::as_array)
        {
            for tool_call in tool_calls {
                let raw_index =
                    tool_call.get("index").and_then(Value::as_u64).unwrap_or(0);
                let index = self.next_block + raw_index;
                if self.started_tools.insert(index) {
                    append_event(
                        output,
                        "content_block_start",
                        &json!({
                            "type":"content_block_start",
                            "index":index,
                            "content_block":{
                                "type":"tool_use",
                                "id":tool_call.get("id").and_then(Value::as_str).unwrap_or("tool_melody"),
                                "name":tool_call.pointer("/function/name").and_then(Value::as_str).unwrap_or("tool"),
                                "input":{}
                            }
                        }),
                    )?;
                }
                if let Some(arguments) = tool_call
                    .pointer("/function/arguments")
                    .and_then(Value::as_str)
                    .filter(|arguments| !arguments.is_empty())
                {
                    append_event(
                        output,
                        "content_block_delta",
                        &json!({"type":"content_block_delta","index":index,"delta":{"type":"input_json_delta","partial_json":arguments}}),
                    )?;
                }
            }
        }
        if let Some(reason) = value
            .pointer("/choices/0/finish_reason")
            .and_then(Value::as_str)
        {
            self.finish_anthropic(chat_finish_to_anthropic(reason), output)?;
        }
        Ok(())
    }

    fn openai_chat_to_responses(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if frame.data == "[DONE]" {
            eprintln!(
                "[stream] OpenAI Chat → Responses: received [DONE], completed={}",
                self.completed
            );
            if !self.completed {
                self.finish_responses("completed", output)?;
            }
            return Ok(());
        }
        let value = parse_json_frame(&frame, "OpenAI Chat")?;
        self.capture_openai_metadata(&value);
        self.start_responses(output)?;
        let has_text = value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .is_some();
        let has_reasoning = value
            .pointer("/choices/0/delta/reasoning_content")
            .or_else(|| value.pointer("/choices/0/delta/reasoning"))
            .and_then(Value::as_str)
            .is_some();
        let has_finish = value
            .pointer("/choices/0/finish_reason")
            .and_then(Value::as_str)
            .is_some();
        let has_tools = value
            .pointer("/choices/0/delta/tool_calls")
            .and_then(Value::as_array)
            .is_some();
        eprintln!("[stream] OpenAI Chat → Responses: text={}, reasoning={}, finish={}, tools={}, output_len={}",
            has_text, has_reasoning, has_finish, has_tools, output.len());
        if let Some(text) = value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
        {
            self.ensure_responses_message(output)?;
            self.responses_text_buf.push_str(text);
            let idx = self.responses_msg_index;
            append_event(
                output,
                "response.output_text.delta",
                &json!({"type":"response.output_text.delta","item_id":"msg_melody","output_index":idx,"content_index":0,"delta":text}),
            )?;
        }
        if let Some(reasoning) = value
            .pointer("/choices/0/delta/reasoning_content")
            .or_else(|| value.pointer("/choices/0/delta/reasoning"))
            .and_then(Value::as_str)
        {
            self.ensure_responses_reasoning(output)?;
            self.responses_reasoning_buf.push_str(reasoning);
            let idx = self.responses_reasoning_index;
            append_event(
                output,
                "response.reasoning_summary_text.delta",
                &json!({"type":"response.reasoning_summary_text.delta","item_id":"rs_melody","output_index":idx,"summary_index":0,"delta":reasoning}),
            )?;
        }
        if let Some(tool_calls) = value
            .pointer("/choices/0/delta/tool_calls")
            .and_then(Value::as_array)
        {
            for tool_call in tool_calls {
                let index = tool_call.get("index").and_then(Value::as_u64).unwrap_or(0);
                if self.started_tools.insert(index) {
                    let call_id = tool_call
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("call_melody")
                        .to_string();
                    let name = tool_call
                        .pointer("/function/name")
                        .and_then(Value::as_str)
                        .unwrap_or("tool")
                        .to_string();
                    let item_id = format!("fc_{call_id}");
                    let output_index = self.next_block;
                    self.next_block += 1;
                    self.responses_tool_ids.insert(index, item_id.clone());
                    self.responses_tool_call_ids.insert(index, call_id.clone());
                    self.responses_tool_names.insert(index, name.clone());
                    self.responses_tool_output_indices
                        .insert(index, output_index);
                    append_event(
                        output,
                        "response.output_item.added",
                        &json!({"type":"response.output_item.added","output_index":output_index,"item":{"type":"function_call","id":item_id,"call_id":call_id,"name":name,"arguments":"","status":"in_progress"}}),
                    )?;
                }
                if let Some(arguments) = tool_call
                    .pointer("/function/arguments")
                    .and_then(Value::as_str)
                    .filter(|arguments| !arguments.is_empty())
                {
                    self.responses_tool_args
                        .entry(index)
                        .or_default()
                        .push_str(arguments);
                    let item_id = self
                        .responses_tool_ids
                        .get(&index)
                        .cloned()
                        .unwrap_or_else(|| "fc_call_melody".to_string());
                    let output_index = self
                        .responses_tool_output_indices
                        .get(&index)
                        .copied()
                        .unwrap_or(index);
                    append_event(
                        output,
                        "response.function_call_arguments.delta",
                        &json!({"type":"response.function_call_arguments.delta","item_id":item_id,"output_index":output_index,"delta":arguments}),
                    )?;
                }
            }
        }
        // Do not complete the Responses lifecycle from finish_reason alone.
        // Some OpenAI-compatible providers repeat a non-null finish_reason
        // on every streamed chunk. Completing here makes clients disconnect
        // after the first token. [DONE] or EOF is the authoritative boundary.
        Ok(())
    }

    fn anthropic_to_responses(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let value = parse_json_frame(&frame, "Anthropic")?;
        let kind = frame
            .event
            .as_deref()
            .or_else(|| value.get("type").and_then(Value::as_str))
            .unwrap_or_default();
        match kind {
            "message_start" => {
                self.id = value
                    .pointer("/message/id")
                    .and_then(Value::as_str)
                    .unwrap_or("resp_melody")
                    .to_string();
                self.model = value
                    .pointer("/message/model")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                self.input_tokens = value
                    .pointer("/message/usage/input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                self.start_responses(output)?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("text_delta") =>
            {
                let text = value
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                self.ensure_responses_message(output)?;
                self.responses_text_buf.push_str(text);
                let idx = self.responses_msg_index;
                append_event(
                    output,
                    "response.output_text.delta",
                    &json!({"type":"response.output_text.delta","item_id":"msg_melody","output_index":idx,"content_index":0,"delta":text}),
                )?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("thinking_delta") =>
            {
                self.ensure_responses_reasoning(output)?;
                let thinking = value
                    .pointer("/delta/thinking")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                self.responses_reasoning_buf.push_str(thinking);
                let idx = self.responses_reasoning_index;
                append_event(
                    output,
                    "response.reasoning_summary_text.delta",
                    &json!({"type":"response.reasoning_summary_text.delta","item_id":"rs_melody","output_index":idx,"summary_index":0,"delta":thinking}),
                )?;
            }
            "content_block_start"
                if value.pointer("/content_block/type").and_then(Value::as_str)
                    == Some("tool_use") =>
            {
                let index = value.get("index").and_then(Value::as_u64).unwrap_or(0);
                let call_id = value
                    .pointer("/content_block/id")
                    .and_then(Value::as_str)
                    .unwrap_or("call_melody");
                let item_id = format!("fc_{call_id}");
                let name = value
                    .pointer("/content_block/name")
                    .and_then(Value::as_str)
                    .unwrap_or("tool")
                    .to_string();
                let output_index = self.next_block;
                self.next_block += 1;
                self.anthropic_tool_item_ids.insert(index, item_id.clone());
                self.started_tools.insert(index);
                self.responses_tool_ids.insert(index, item_id.clone());
                self.responses_tool_call_ids
                    .insert(index, call_id.to_string());
                self.responses_tool_names.insert(index, name.clone());
                self.responses_tool_output_indices
                    .insert(index, output_index);
                append_event(
                    output,
                    "response.output_item.added",
                    &json!({"type":"response.output_item.added","output_index":output_index,"item":{"type":"function_call","id":item_id,"call_id":call_id,"name":name,"arguments":"","status":"in_progress"}}),
                )?;
            }
            "content_block_delta"
                if value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("input_json_delta") =>
            {
                let block_index =
                    value.get("index").and_then(Value::as_u64).unwrap_or(0);
                let item_id = self
                    .anthropic_tool_item_ids
                    .get(&block_index)
                    .cloned()
                    .unwrap_or_else(|| "fc_call_melody".to_string());
                let output_index = self
                    .responses_tool_output_indices
                    .get(&block_index)
                    .copied()
                    .unwrap_or(block_index);
                let partial = value
                    .pointer("/delta/partial_json")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                self.responses_tool_args
                    .entry(block_index)
                    .or_default()
                    .push_str(partial);
                append_event(
                    output,
                    "response.function_call_arguments.delta",
                    &json!({"type":"response.function_call_arguments.delta","item_id":item_id,"output_index":output_index,"delta":partial}),
                )?;
            }
            "message_delta" => {
                self.output_tokens = value
                    .pointer("/usage/output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(self.output_tokens);
                self.finish_responses("completed", output)?;
            }
            "error" => return stream_error(&value, "Anthropic stream error"),
            _ => {}
        }
        Ok(())
    }

    fn responses_to_openai_chat(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let value = parse_json_frame(&frame, "Responses")?;
        let kind = frame
            .event
            .as_deref()
            .or_else(|| value.get("type").and_then(Value::as_str))
            .unwrap_or_default();
        match kind {
            "response.created" | "response.in_progress" => {
                self.capture_responses_metadata(&value);
                append_data(
                    output,
                    &self.chat_chunk(json!({"role":"assistant"}), Value::Null),
                )?;
            }
            "response.output_text.delta" => {
                append_data(
                    output,
                    &self.chat_chunk(
                        json!({"content":value.get("delta").and_then(Value::as_str).unwrap_or_default()}),
                        Value::Null,
                    ),
                )?;
            }
            "response.reasoning_summary_text.delta" => {
                append_data(
                    output,
                    &self.chat_chunk(
                        json!({"reasoning_content":value.get("delta").and_then(Value::as_str).unwrap_or_default()}),
                        Value::Null,
                    ),
                )?;
            }
            "response.output_item.added"
                if value.pointer("/item/type").and_then(Value::as_str)
                    == Some("function_call") =>
            {
                let index = value
                    .get("output_index")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                append_data(
                    output,
                    &self.chat_chunk(
                        json!({"tool_calls":[{
                            "index":index,
                            "id":value.pointer("/item/call_id").or_else(|| value.pointer("/item/id")).and_then(Value::as_str).unwrap_or("call_melody"),
                            "type":"function",
                            "function":{"name":value.pointer("/item/name").and_then(Value::as_str).unwrap_or("tool"),"arguments":""}
                        }]}),
                        Value::Null,
                    ),
                )?;
            }
            "response.function_call_arguments.delta" => {
                let index = value
                    .get("output_index")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                append_data(
                    output,
                    &self.chat_chunk(
                        json!({"tool_calls":[{"index":index,"function":{"arguments":value.get("delta").and_then(Value::as_str).unwrap_or_default()}}]}),
                        Value::Null,
                    ),
                )?;
            }
            "response.completed" => {
                self.capture_responses_metadata(&value);
                append_data(output, &self.chat_chunk(json!({}), json!("stop")))?;
                output.extend_from_slice(b"data: [DONE]\n\n");
                self.completed = true;
            }
            "response.failed" | "error" => {
                return stream_error(&value, "Responses stream error")
            }
            _ => {}
        }
        Ok(())
    }

    fn responses_to_anthropic(
        &mut self,
        frame: SseFrame,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        let value = parse_json_frame(&frame, "Responses")?;
        let kind = frame
            .event
            .as_deref()
            .or_else(|| value.get("type").and_then(Value::as_str))
            .unwrap_or_default();
        match kind {
            "response.created" | "response.in_progress" => {
                self.capture_responses_metadata(&value);
                if !self.content_started {
                    append_event(
                        output,
                        "message_start",
                        &json!({"type":"message_start","message":{"id":non_empty(&self.id,"msg_melody"),"type":"message","role":"assistant","model":non_empty(&self.model,"unknown"),"content":[],"stop_reason":Value::Null,"stop_sequence":Value::Null,"usage":{"input_tokens":self.input_tokens,"output_tokens":0}}}),
                    )?;
                    self.content_started = true;
                }
            }
            "response.reasoning_summary_text.delta" => {
                let (idx, is_thinking) = self.ensure_thinking_block(output)?;
                let delta_text = value
                    .get("delta")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if is_thinking {
                    append_event(
                        output,
                        "content_block_delta",
                        &json!({"type":"content_block_delta","index":idx,"delta":{"type":"thinking_delta","thinking":delta_text}}),
                    )?;
                } else {
                    append_event(
                        output,
                        "content_block_delta",
                        &json!({"type":"content_block_delta","index":idx,"delta":{"type":"text_delta","text":delta_text}}),
                    )?;
                }
            }
            "response.output_text.delta" => {
                let idx = self.ensure_text_block(output)?;
                append_event(
                    output,
                    "content_block_delta",
                    &json!({"type":"content_block_delta","index":idx,"delta":{"type":"text_delta","text":value.get("delta").and_then(Value::as_str).unwrap_or_default()}}),
                )?;
            }
            "response.output_item.added"
                if value.pointer("/item/type").and_then(Value::as_str)
                    == Some("function_call") =>
            {
                let raw_index = value
                    .get("output_index")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let index = self.next_block + raw_index;
                append_event(
                    output,
                    "content_block_start",
                    &json!({"type":"content_block_start","index":index,"content_block":{"type":"tool_use","id":value.pointer("/item/call_id").or_else(|| value.pointer("/item/id")).and_then(Value::as_str).unwrap_or("call_melody"),"name":value.pointer("/item/name").and_then(Value::as_str).unwrap_or("tool"),"input":{}}}),
                )?;
            }
            "response.function_call_arguments.delta" => {
                let raw_index = value
                    .get("output_index")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let index = self.next_block + raw_index;
                append_event(
                    output,
                    "content_block_delta",
                    &json!({"type":"content_block_delta","index":index,"delta":{"type":"input_json_delta","partial_json":value.get("delta").and_then(Value::as_str).unwrap_or_default()}}),
                )?;
            }
            "response.completed" => {
                self.capture_responses_metadata(&value);
                self.finish_anthropic("end_turn", output)?;
            }
            "response.failed" | "error" => {
                return stream_error(&value, "Responses stream error")
            }
            _ => {}
        }
        Ok(())
    }

    fn capture_openai_metadata(&mut self, value: &Value) {
        if let Some(id) = value.get("id").and_then(Value::as_str) {
            self.id = id.to_string();
        }
        if let Some(model) = value.get("model").and_then(Value::as_str) {
            self.model = model.to_string();
        }
        self.input_tokens = value
            .pointer("/usage/prompt_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(self.input_tokens);
        self.output_tokens = value
            .pointer("/usage/completion_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(self.output_tokens);
    }

    fn capture_responses_metadata(&mut self, value: &Value) {
        let response = value.get("response").unwrap_or(value);
        if let Some(id) = response.get("id").and_then(Value::as_str) {
            self.id = id.to_string();
        }
        if let Some(model) = response.get("model").and_then(Value::as_str) {
            self.model = model.to_string();
        }
        self.input_tokens = response
            .pointer("/usage/input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(self.input_tokens);
        self.output_tokens = response
            .pointer("/usage/output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(self.output_tokens);
    }

    fn chat_chunk(&self, delta: Value, finish_reason: Value) -> Value {
        json!({
            "id": non_empty(&self.id, "chatcmpl-melody"),
            "object": "chat.completion.chunk",
            "created": 0,
            "model": non_empty(&self.model, "unknown"),
            "choices": [{"index":0,"delta":delta,"finish_reason":finish_reason}],
            "usage": if finish_reason.is_null() { Value::Null } else { json!({
                "prompt_tokens":self.input_tokens,
                "completion_tokens":self.output_tokens,
                "total_tokens":self.input_tokens + self.output_tokens
            })}
        })
    }

    fn start_responses(&mut self, output: &mut Vec<u8>) -> Result<(), ConversionError> {
        if self.content_started {
            return Ok(());
        }
        append_event(
            output,
            "response.created",
            &json!({"type":"response.created","response":{"id":non_empty(&self.id,"resp_melody"),"object":"response","status":"in_progress","model":non_empty(&self.model,"unknown"),"output":[]}}),
        )?;
        self.content_started = true;
        Ok(())
    }

    fn finish_responses(
        &mut self,
        status: &str,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if self.completed {
            return Ok(());
        }
        // Ensure response.created has been sent (cc-switch pattern:
        // always emit the lifecycle start before terminal events).
        if !self.content_started {
            self.start_responses(output)?;
        }
        self.close_responses_items(output)?;
        let completed_output: Vec<Value> =
            self.responses_completed_items.values().cloned().collect();
        append_event(
            output,
            "response.completed",
            &json!({"type":"response.completed","response":{"id":non_empty(&self.id,"resp_melody"),"object":"response","status":status,"model":non_empty(&self.model,"unknown"),"output":completed_output,"usage":{"input_tokens":self.input_tokens,"output_tokens":self.output_tokens,"total_tokens":self.input_tokens+self.output_tokens}}}),
        )?;
        self.completed = true;
        Ok(())
    }

    fn finish_anthropic(
        &mut self,
        stop_reason: &str,
        output: &mut Vec<u8>,
    ) -> Result<(), ConversionError> {
        if self.completed {
            return Ok(());
        }
        self.close_open_blocks(output)?;
        append_event(
            output,
            "message_delta",
            &json!({"type":"message_delta","delta":{"stop_reason":stop_reason,"stop_sequence":Value::Null},"usage":{"output_tokens":self.output_tokens}}),
        )?;
        append_event(output, "message_stop", &json!({"type":"message_stop"}))?;
        self.completed = true;
        Ok(())
    }
}

fn parse_json_frame(frame: &SseFrame, protocol: &str) -> Result<Value, ConversionError> {
    serde_json::from_str(&frame.data).map_err(|error| {
        ConversionError::invalid(
            "stream",
            "$.data",
            format!("invalid {protocol} event JSON: {error}"),
        )
    })
}

fn non_empty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() {
        fallback
    } else {
        value
    }
}

fn chat_finish_to_anthropic(reason: &str) -> &'static str {
    match reason {
        "length" => "max_tokens",
        "tool_calls" => "tool_use",
        "content_filter" => "refusal",
        _ => "end_turn",
    }
}

fn stream_error(value: &Value, fallback: &str) -> Result<(), ConversionError> {
    Err(ConversionError::invalid(
        "stream",
        "$.error",
        value
            .pointer("/error/message")
            .or_else(|| value.pointer("/response/error/message"))
            .and_then(Value::as_str)
            .unwrap_or(fallback),
    ))
}

fn append_event(
    output: &mut Vec<u8>,
    event: &str,
    value: &Value,
) -> Result<(), ConversionError> {
    output.extend_from_slice(b"event: ");
    output.extend_from_slice(event.as_bytes());
    output.extend_from_slice(b"\n");
    append_data(output, value)
}

fn append_data(output: &mut Vec<u8>, value: &Value) -> Result<(), ConversionError> {
    let json = serde_json::to_string(value).map_err(|error| {
        ConversionError::invalid(
            "stream",
            "$",
            format!("failed to serialize SSE event: {error}"),
        )
    })?;
    output.extend_from_slice(b"data: ");
    output.extend_from_slice(json.as_bytes());
    output.extend_from_slice(b"\n\n");
    Ok(())
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<SseFrame>, ConversionError> {
        self.buffer.extend_from_slice(bytes);
        let mut frames = Vec::new();

        while let Some((end, delimiter_len)) = find_frame_boundary(&self.buffer) {
            let frame_bytes = self.buffer[..end].to_vec();
            self.buffer.drain(..end + delimiter_len);
            if let Some(frame) = parse_frame(&frame_bytes)? {
                frames.push(frame);
            }
        }
        Ok(frames)
    }

    pub fn finish(&mut self) -> Result<Vec<SseFrame>, ConversionError> {
        if self.buffer.iter().all(|byte| byte.is_ascii_whitespace()) {
            self.buffer.clear();
            return Ok(vec![]);
        }
        let remaining = std::mem::take(&mut self.buffer);
        parse_frame(&remaining).map(|frame| frame.into_iter().collect())
    }
}

fn find_frame_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|window| window == b"\n\n");
    let crlf = buffer.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(left), None) => Some((left, 2)),
        (None, Some(right)) => Some((right, 4)),
        (None, None) => None,
    }
}

fn parse_frame(bytes: &[u8]) -> Result<Option<SseFrame>, ConversionError> {
    let text = std::str::from_utf8(bytes).map_err(|error| {
        ConversionError::invalid(
            "stream",
            "$",
            format!("SSE frame is not valid UTF-8: {error}"),
        )
    })?;
    let mut event = None;
    let mut data = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(value) = line.strip_prefix("event:") {
            event = Some(value.strip_prefix(' ').unwrap_or(value).to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data.push(value.strip_prefix(' ').unwrap_or(value));
        }
    }
    if data.is_empty() {
        return Ok(None);
    }
    Ok(Some(SseFrame {
        event,
        data: data.join("\n"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_events_across_arbitrary_http_chunks() {
        let mut decoder = SseDecoder::new();

        assert!(decoder
            .push(b"event: content_block_delta\ndata: {\"delta\":{\"te")
            .unwrap()
            .is_empty());
        let frames = decoder
            .push(b"xt\":\"\xe4\xbd\xa0\xe5\xa5\xbd\"}}\n\ndata: [DONE]\r\n\r\n")
            .unwrap();

        assert_eq!(
            frames,
            vec![
                SseFrame {
                    event: Some("content_block_delta".into()),
                    data: "{\"delta\":{\"text\":\"你好\"}}".into(),
                },
                SseFrame {
                    event: None,
                    data: "[DONE]".into(),
                },
            ]
        );
        assert!(decoder.finish().unwrap().is_empty());
    }

    #[test]
    fn joins_multiline_data_and_ignores_comments() {
        let mut decoder = SseDecoder::new();
        let frames = decoder
            .push(b": keepalive\nevent: note\ndata: first\ndata: second\n\n")
            .unwrap();
        assert_eq!(
            frames,
            vec![SseFrame {
                event: Some("note".into()),
                data: "first\nsecond".into(),
            }]
        );
    }

    #[test]
    fn converts_anthropic_text_stream_to_openai_chat_chunks() {
        let mut converter = StreamConverter::new(
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        );
        let input = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"model\":\"claude-sonnet\",\"usage\":{\"input_tokens\":5,\"output_tokens\":0}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n",
            "event: message_stop\n",
            "data: {\"type\":\"message_stop\"}\n\n"
        );

        let output = converter.push(input.as_bytes()).unwrap();
        let output = String::from_utf8(output).unwrap();

        assert!(output.contains("\"object\":\"chat.completion.chunk\""));
        assert!(output.contains("\"delta\":{\"content\":\"Hello\"}"));
        assert!(output.contains("\"finish_reason\":\"stop\""));
        assert!(output.contains("\"prompt_tokens\":5"));
        assert!(output.ends_with("data: [DONE]\n\n"));
    }

    #[test]
    fn declares_all_three_protocol_pairs_convertible() {
        for source in [
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiResponses,
        ] {
            for target in [
                ProtocolKind::OpenAiChat,
                ProtocolKind::AnthropicMessages,
                ProtocolKind::OpenAiResponses,
            ] {
                assert!(
                    supports_stream_conversion(source, target),
                    "{source:?} -> {target:?} should be supported"
                );
            }
        }
    }

    #[test]
    fn converts_openai_chat_text_stream_to_anthropic_events() {
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        );
        let input = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1}}\n\n",
            "data: [DONE]\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();
        assert!(output.contains("event: message_start"));
        assert!(output.contains("\"type\":\"text_delta\""));
        assert!(output.contains("\"text\":\"Hello\""));
        assert!(output.contains("\"stop_reason\":\"end_turn\""));
        assert!(output.contains("event: message_stop"));
    }

    #[test]
    fn converts_responses_text_stream_to_openai_chat_chunks() {
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiResponses,
            ProtocolKind::OpenAiChat,
        );
        let input = concat!(
            "event: response.created\n",
            "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_1\",\"model\":\"gpt-5\"}}\n\n",
            "event: response.output_text.delta\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n",
            "event: response.completed\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":4,\"output_tokens\":2}}}\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();
        assert!(output.contains("\"object\":\"chat.completion.chunk\""));
        assert!(output.contains("\"delta\":{\"content\":\"Hello\"}"));
        assert!(output.contains("\"finish_reason\":\"stop\""));
        assert!(output.ends_with("data: [DONE]\n\n"));
    }

    #[test]
    fn converts_anthropic_tool_argument_deltas_to_openai_chat() {
        let mut converter = StreamConverter::new(
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        );
        let input = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"model\":\"claude\",\"usage\":{\"input_tokens\":5}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool_1\",\"name\":\"weather\",\"input\":{}}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"city\\\":\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"Shanghai\\\"}\"}}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":4}}\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();
        assert!(output.contains("\"finish_reason\":\"tool_calls\""));
        assert!(output.contains("\"id\":\"tool_1\""));
        assert!(output.contains("\"name\":\"weather\""));
        assert!(output.contains("Shanghai"));
    }

    #[test]
    fn converts_openai_reasoning_then_text_to_anthropic_with_content_block_lifecycle() {
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        );
        let input = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"Let me think\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"...\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hi\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n",
            "data: [DONE]\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();

        // thinking 内容块应在 index 0 开启
        assert!(output.contains("\"index\":0,\"type\":\"content_block_start\""));
        assert!(output.contains("\"type\":\"thinking\""));
        assert!(output.contains("\"thinking\":\"Let me think\""));

        // 切换到 text 前应关闭 thinking 块
        assert!(output.contains("\"index\":0,\"type\":\"content_block_stop\""));

        // text 内容块应在 index 1 开启
        assert!(output.contains("\"index\":1,\"type\":\"content_block_start\""));
        assert!(output.contains("\"type\":\"text\""));
        assert!(output.contains("\"text\":\"Hi\""));

        // 结束前应关闭 text 块
        assert!(output.contains("\"index\":1,\"type\":\"content_block_stop\""));

        assert!(output.contains("\"stop_reason\":\"end_turn\""));
        assert!(output.contains("event: message_stop"));
    }

    #[test]
    fn converts_openai_alternating_reasoning_text_to_single_thinking_block() {
        // 上游模型在 reasoning 和 content 之间交替时，
        // 一旦 text 块开始，后续的 reasoning 应合并到 text 块，
        // 而不是创建新的 thinking 块。
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        );
        let input = concat!(
            // 第一段思考
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"思考1\"},\"finish_reason\":null}]}\n\n",
            // 开始输出 text
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"回答\"},\"finish_reason\":null}]}\n\n",
            // 又出现 reasoning（应合并到 text 块，不创建新 thinking 块）
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"思考2\"},\"finish_reason\":null}]}\n\n",
            // 继续 text
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"继续\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n",
            "data: [DONE]\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();

        // 只应有一个 thinking 块（index 0）和一个 text 块（index 1）
        assert!(output.contains("\"type\":\"thinking\""));
        assert!(output.contains("\"thinking\":\"思考1\""));

        // "思考2" 应作为 text_delta 而非 thinking_delta 出现
        assert!(output.contains("\"text\":\"思考2\""));
        assert!(!output.contains("\"thinking\":\"思考2\""));

        // 不应出现 index 2 的 content_block_start（即不创建第二个 thinking 块）
        assert!(!output.contains("\"index\":2,\"type\":\"content_block_start\""));
    }

    #[test]
    fn converts_openai_chat_to_responses_with_proper_output_item_lifecycle() {
        // 验证 OpenAI Chat → Responses 转换时，
        // 在 response.output_text.delta 之前必须发送
        // response.output_item.added 和 response.content_part.added，
        // 否则 AI SDK 会报 "text part msg_melody not found" 错误。
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        );
        let input = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"gpt-4\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1}}\n\n",
            "data: [DONE]\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();

        // 1. response.created 必须最先发送
        let created_pos = output.find("response.created").unwrap();

        // 2. response.output_item.added 必须在 delta 之前发送
        let item_added_pos = output
            .find("\"type\":\"response.output_item.added\"")
            .unwrap();
        assert!(item_added_pos > created_pos);
        assert!(output.contains("\"id\":\"msg_melody\""));
        assert!(output.contains("\"type\":\"message\""));

        // 3. response.content_part.added 必须在 delta 之前发送
        let part_added_pos = output
            .find("\"type\":\"response.content_part.added\"")
            .unwrap();
        assert!(part_added_pos > item_added_pos);

        // 4. response.output_text.delta 在 output_item.added 之后
        let delta_pos = output
            .find("\"type\":\"response.output_text.delta\"")
            .unwrap();
        assert!(delta_pos > part_added_pos);
        assert!(output.contains("\"item_id\":\"msg_melody\""));
        assert!(output.contains("\"delta\":\"Hello\""));

        // 5. 完成事件必须正确关闭输出项
        assert!(output.contains("\"type\":\"response.output_text.done\""));
        assert!(output.contains("\"type\":\"response.content_part.done\""));
        assert!(output.contains("\"type\":\"response.output_item.done\""));
        assert!(output.contains("\"type\":\"response.completed\""));
    }

    #[test]
    fn does_not_complete_responses_when_provider_repeats_finish_reason() {
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        );

        let first = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"The\"},\"finish_reason\":\"stop\"}]}\n\n"
        );
        let first_output =
            String::from_utf8(converter.push(first.as_bytes()).unwrap()).unwrap();
        assert!(first_output.contains("\"delta\":\"The\""));
        assert!(!first_output.contains("\"type\":\"response.completed\""));

        let remaining = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"你好！\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n"
        );
        let remaining_output =
            String::from_utf8(converter.push(remaining.as_bytes()).unwrap()).unwrap();
        assert!(remaining_output.contains("\"delta\":\"你好！\""));
        assert!(remaining_output.contains("\"type\":\"response.completed\""));
    }

    #[test]
    fn converts_chat_tool_call_to_distinct_complete_responses_item() {
        let mut converter = StreamConverter::new(
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        );
        let input = concat!(
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"Need a command\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"type\":\"function\",\"function\":{\"name\":\"exec_command\",\"arguments\":\"{\\\"cmd\\\":\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
            "data: {\"id\":\"chat_1\",\"model\":\"deepseek-v4\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"pwd\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
            "data: [DONE]\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();
        assert!(output.contains("\"call_id\":\"call_123\""));
        assert!(output.contains("\"name\":\"exec_command\""));
        assert!(output.contains("\"arguments\":\"{\\\"cmd\\\":\\\"pwd\\\"}\""));
        assert!(output.contains("\"output_index\":0"));
        assert!(output.contains("\"output_index\":1"));
        assert!(!output.contains("\"name\":\"tool\""));
        assert!(!output.contains("\"type\":\"message\""));
        assert!(output.contains("\"type\":\"response.completed\""));

        let completed = output
            .rsplit_once("event: response.completed")
            .map(|(_, event)| event)
            .unwrap();
        assert!(!completed.contains("\"output\":[]"));
        let reasoning_pos = completed.find("\"type\":\"reasoning\"").unwrap();
        let tool_pos = completed.find("\"type\":\"function_call\"").unwrap();
        assert!(reasoning_pos < tool_pos);
    }

    #[test]
    fn converts_anthropic_to_responses_with_proper_output_item_lifecycle() {
        // 验证 Anthropic → Responses 转换时，
        // 在 response.output_text.delta 之前必须发送
        // response.output_item.added 和 response.content_part.added。
        let mut converter = StreamConverter::new(
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiResponses,
        );
        let input = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"model\":\"claude-sonnet\",\"usage\":{\"input_tokens\":5,\"output_tokens\":0}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n",
            "event: message_stop\n",
            "data: {\"type\":\"message_stop\"}\n\n"
        );

        let output =
            String::from_utf8(converter.push(input.as_bytes()).unwrap()).unwrap();

        // 验证事件顺序
        let created_pos = output.find("response.created").unwrap();
        let item_added_pos = output
            .find("\"type\":\"response.output_item.added\"")
            .unwrap();
        assert!(item_added_pos > created_pos);

        let part_added_pos = output
            .find("\"type\":\"response.content_part.added\"")
            .unwrap();
        assert!(part_added_pos > item_added_pos);

        let delta_pos = output
            .find("\"type\":\"response.output_text.delta\"")
            .unwrap();
        assert!(delta_pos > part_added_pos);

        // 验证完成事件
        assert!(output.contains("\"type\":\"response.output_text.done\""));
        assert!(output.contains("\"type\":\"response.output_item.done\""));
        assert!(output.contains("\"type\":\"response.completed\""));
    }
}
