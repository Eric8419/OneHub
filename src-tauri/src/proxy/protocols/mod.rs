//! Wire-protocol codecs built around Melody Hub's canonical IR.

pub mod stream;

use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::proxy::canonical::{
    CanonicalRequest, CanonicalResponse, ContentBlock, FinishReason, MediaSource,
    Message, OutputFormat, ReasoningConfig, Role, ToolChoice, ToolDefinition, Usage,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProtocolKind {
    OpenAiChat,
    AnthropicMessages,
    OpenAiResponses,
}

impl ProtocolKind {
    pub fn from_flavor(flavor: &str) -> Self {
        match flavor {
            "anthropic" | "anthropic-messages" => Self::AnthropicMessages,
            "responses" | "openai-responses" => Self::OpenAiResponses,
            _ => Self::OpenAiChat,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversionError {
    pub feature: &'static str,
    pub path: String,
    pub message: String,
}

impl ConversionError {
    pub fn invalid(
        feature: &'static str,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            feature,
            path: path.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for ConversionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} at {}: {}", self.feature, self.path, self.message)
    }
}

impl std::error::Error for ConversionError {}

pub fn convert_request(
    body: &Value,
    source: ProtocolKind,
    target: ProtocolKind,
) -> Result<Value, ConversionError> {
    if source == target {
        return Ok(body.clone());
    }

    let canonical = match source {
        ProtocolKind::OpenAiChat => decode_openai_chat_request(body)?,
        ProtocolKind::AnthropicMessages => decode_anthropic_request(body)?,
        ProtocolKind::OpenAiResponses => decode_responses_request(body)?,
    };

    match target {
        ProtocolKind::AnthropicMessages => encode_anthropic_request(&canonical),
        ProtocolKind::OpenAiChat => encode_openai_chat_request(&canonical),
        ProtocolKind::OpenAiResponses => encode_responses_request(&canonical),
    }
}

pub fn convert_response(
    body: &Value,
    source: ProtocolKind,
    target: ProtocolKind,
) -> Result<Value, ConversionError> {
    if source == target {
        return Ok(body.clone());
    }
    let canonical = match source {
        ProtocolKind::AnthropicMessages => decode_anthropic_response(body)?,
        ProtocolKind::OpenAiChat => decode_openai_chat_response(body)?,
        ProtocolKind::OpenAiResponses => decode_responses_response(body)?,
    };
    match target {
        ProtocolKind::OpenAiChat => encode_openai_chat_response(&canonical),
        ProtocolKind::AnthropicMessages => encode_anthropic_response(&canonical),
        ProtocolKind::OpenAiResponses => encode_responses_response(&canonical),
    }
}

fn decode_responses_response(
    body: &Value,
) -> Result<CanonicalResponse, ConversionError> {
    let id = required_string(body, "id")?;
    let model = required_string(body, "model")?;
    let output = body
        .get("output")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ConversionError::invalid("output", "$.output", "expected an array")
        })?;
    let mut content = Vec::new();
    for (item_index, item) in output.iter().enumerate() {
        if item.get("type").and_then(Value::as_str) == Some("function_call") {
            let arguments_text = item
                .get("arguments")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("$.output[{item_index}].arguments"),
                        "expected a JSON string",
                    )
                })?;
            content.push(ContentBlock::ToolCall {
                id: item
                    .get("call_id")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or("call_melody")
                    .to_string(),
                name: item
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.output[{item_index}].name"),
                            "expected a string",
                        )
                    })?
                    .to_string(),
                arguments: serde_json::from_str(arguments_text).map_err(|error| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("$.output[{item_index}].arguments"),
                        format!("invalid JSON arguments: {error}"),
                    )
                })?,
            });
            continue;
        }
        if item.get("type").and_then(Value::as_str) == Some("reasoning") {
            let text = item
                .get("summary")
                .and_then(Value::as_array)
                .map(|summary| {
                    summary
                        .iter()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            content.push(ContentBlock::Reasoning {
                text,
                signature: item
                    .get("encrypted_content")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
            });
            continue;
        }
        if item.get("type").and_then(Value::as_str) != Some("message") {
            return Err(ConversionError::invalid(
                "output",
                format!("$.output[{item_index}].type"),
                "unsupported Responses output item",
            ));
        }
        let blocks = item
            .get("content")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                ConversionError::invalid(
                    "output",
                    format!("$.output[{item_index}].content"),
                    "expected an array",
                )
            })?;
        for (block_index, block) in blocks.iter().enumerate() {
            match block.get("type").and_then(Value::as_str) {
                Some("output_text") => {
                    let text =
                        block.get("text").and_then(Value::as_str).ok_or_else(|| {
                            ConversionError::invalid(
                                "output",
                                format!(
                                    "$.output[{item_index}].content[{block_index}].text"
                                ),
                                "expected a string",
                            )
                        })?;
                    content.push(ContentBlock::Text {
                        text: text.to_string(),
                    });
                }
                Some("refusal") => {
                    let text = block
                        .get("refusal")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    content.push(ContentBlock::Refusal {
                        text: text.to_string(),
                    });
                }
                other => {
                    return Err(ConversionError::invalid(
                        "output",
                        format!("$.output[{item_index}].content[{block_index}].type"),
                        format!("unsupported output block {other:?}"),
                    ))
                }
            }
        }
    }
    let finish_reason = match body.get("status").and_then(Value::as_str) {
        Some("completed") => FinishReason::Stop,
        Some("failed") => FinishReason::Error,
        Some("incomplete")
            if body
                .pointer("/incomplete_details/reason")
                .and_then(Value::as_str)
                == Some("max_output_tokens") =>
        {
            FinishReason::Length
        }
        Some(_) | None => FinishReason::Unknown,
    };
    let input_tokens = body
        .pointer("/usage/input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = body
        .pointer("/usage/output_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let total_tokens = body
        .pointer("/usage/total_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(input_tokens + output_tokens);
    Ok(CanonicalResponse {
        id,
        model,
        content,
        finish_reason,
        usage: Usage {
            input_tokens,
            output_tokens,
            total_tokens,
            cached_input_tokens: body
                .pointer("/usage/input_tokens_details/cached_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            reasoning_tokens: body
                .pointer("/usage/output_tokens_details/reasoning_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            ..Usage::default()
        },
    })
}

fn decode_openai_chat_response(
    body: &Value,
) -> Result<CanonicalResponse, ConversionError> {
    let id = required_string(body, "id")?;
    let model = required_string(body, "model")?;
    let choice = body
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| {
            ConversionError::invalid(
                "choices",
                "$.choices[0]",
                "expected at least one choice",
            )
        })?;
    let message = choice.get("message").ok_or_else(|| {
        ConversionError::invalid(
            "choices",
            "$.choices[0].message",
            "message is required",
        )
    })?;
    let mut content = match message.get("content") {
        Some(Value::String(text)) => vec![ContentBlock::Text { text: text.clone() }],
        Some(Value::Null) | None => vec![],
        Some(value) => text_blocks(value, "$.choices[0].message.content")?,
    };
    if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
        for (index, tool_call) in tool_calls.iter().enumerate() {
            let arguments_text = tool_call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("$.choices[0].message.tool_calls[{index}].function.arguments"),
                        "expected a JSON string",
                    )
                })?;
            content.push(ContentBlock::ToolCall {
                id: tool_call
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.choices[0].message.tool_calls[{index}].id"),
                            "expected a string",
                        )
                    })?
                    .to_string(),
                name: tool_call
                    .pointer("/function/name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!(
                                "$.choices[0].message.tool_calls[{index}].function.name"
                            ),
                            "expected a string",
                        )
                    })?
                    .to_string(),
                arguments: serde_json::from_str(arguments_text).map_err(|error| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!(
                            "$.choices[0].message.tool_calls[{index}].function.arguments"
                        ),
                        format!("invalid JSON arguments: {error}"),
                    )
                })?,
            });
        }
    }
    if let Some(reasoning) = message
        .get("reasoning_content")
        .or_else(|| message.get("reasoning"))
        .and_then(Value::as_str)
    {
        content.push(ContentBlock::Reasoning {
            text: reasoning.to_string(),
            signature: None,
        });
    }
    let finish_reason = match choice.get("finish_reason").and_then(Value::as_str) {
        Some("stop") => FinishReason::Stop,
        Some("length") => FinishReason::Length,
        Some("tool_calls" | "function_call") => FinishReason::ToolCalls,
        Some("content_filter") => FinishReason::ContentFilter,
        Some(_) | None => FinishReason::Unknown,
    };
    let input_tokens = body
        .pointer("/usage/prompt_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = body
        .pointer("/usage/completion_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let total_tokens = body
        .pointer("/usage/total_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(input_tokens + output_tokens);
    let cached_input_tokens = body
        .pointer("/usage/prompt_tokens_details/cached_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let reasoning_tokens = body
        .pointer("/usage/completion_tokens_details/reasoning_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Ok(CanonicalResponse {
        id,
        model,
        content,
        finish_reason,
        usage: Usage {
            input_tokens,
            output_tokens,
            total_tokens,
            cached_input_tokens,
            reasoning_tokens,
            ..Usage::default()
        },
    })
}

fn decode_anthropic_response(
    body: &Value,
) -> Result<CanonicalResponse, ConversionError> {
    let id = required_string(body, "id")?;
    let model = required_string(body, "model")?;
    let raw_content =
        body.get("content")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                ConversionError::invalid("content", "$.content", "expected an array")
            })?;
    let mut content = Vec::with_capacity(raw_content.len());
    for (index, block) in raw_content.iter().enumerate() {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                let text =
                    block.get("text").and_then(Value::as_str).ok_or_else(|| {
                        ConversionError::invalid(
                            "content",
                            format!("$.content[{index}].text"),
                            "expected a string",
                        )
                    })?;
                content.push(ContentBlock::Text {
                    text: text.to_string(),
                });
            }
            Some("tool_use") => {
                let id = block.get("id").and_then(Value::as_str).ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("$.content[{index}].id"),
                        "expected a string",
                    )
                })?;
                let name =
                    block.get("name").and_then(Value::as_str).ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.content[{index}].name"),
                            "expected a string",
                        )
                    })?;
                content.push(ContentBlock::ToolCall {
                    id: id.to_string(),
                    name: name.to_string(),
                    arguments: block
                        .get("input")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({})),
                });
            }
            Some("thinking") => {
                content.push(ContentBlock::Reasoning {
                    text: block
                        .get("thinking")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    signature: block
                        .get("signature")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned),
                });
            }
            other => {
                return Err(ConversionError::invalid(
                    "content",
                    format!("$.content[{index}].type"),
                    format!("unsupported response block {other:?}"),
                ))
            }
        }
    }
    let finish_reason = match body.get("stop_reason").and_then(Value::as_str) {
        Some("end_turn" | "stop_sequence") => FinishReason::Stop,
        Some("max_tokens") => FinishReason::Length,
        Some("tool_use") => FinishReason::ToolCalls,
        Some("refusal") => FinishReason::ContentFilter,
        Some(_) | None => FinishReason::Unknown,
    };
    let input_tokens = body
        .pointer("/usage/input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = body
        .pointer("/usage/output_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cached_input_tokens = body
        .pointer("/usage/cache_read_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Ok(CanonicalResponse {
        id,
        model,
        content,
        finish_reason,
        usage: Usage {
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
            cached_input_tokens,
            ..Usage::default()
        },
    })
}

fn encode_openai_chat_response(
    response: &CanonicalResponse,
) -> Result<Value, ConversionError> {
    let mut normal_blocks = Vec::new();
    let mut tool_calls = Vec::new();
    let mut reasoning_content = Vec::new();
    for (index, block) in response.content.iter().enumerate() {
        match block {
            ContentBlock::ToolCall {
                id,
                name,
                arguments,
            } => tool_calls.push(serde_json::json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": serde_json::to_string(arguments).map_err(|error| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.content[{index}]"),
                            format!("failed to encode arguments: {error}"),
                        )
                    })?,
                }
            })),
            ContentBlock::Reasoning { text, .. } => reasoning_content.push(text.clone()),
            other => normal_blocks.push(other.clone()),
        }
    }
    let content = if normal_blocks.is_empty() {
        Value::Null
    } else {
        canonical_blocks_to_openai_chat(&normal_blocks, "$.content")?
    };
    let finish_reason = match response.finish_reason {
        FinishReason::Stop => "stop",
        FinishReason::Length => "length",
        FinishReason::ToolCalls => "tool_calls",
        FinishReason::ContentFilter => "content_filter",
        FinishReason::Error | FinishReason::Unknown => "stop",
    };
    let mut message = serde_json::json!({
        "role": "assistant",
        "content": content,
    });
    if !tool_calls.is_empty() {
        message["tool_calls"] = Value::Array(tool_calls);
    }
    if !reasoning_content.is_empty() {
        message["reasoning_content"] = Value::String(reasoning_content.join("\n"));
    }
    Ok(serde_json::json!({
        "id": response.id,
        "object": "chat.completion",
        "created": 0,
        "model": response.model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason
        }],
        "usage": {
            "prompt_tokens": response.usage.input_tokens,
            "completion_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.total_tokens,
        }
    }))
}

fn encode_anthropic_response(
    response: &CanonicalResponse,
) -> Result<Value, ConversionError> {
    let content = canonical_blocks_to_anthropic(&response.content, "$.content")?;
    let stop_reason = match response.finish_reason {
        FinishReason::Stop => "end_turn",
        FinishReason::Length => "max_tokens",
        FinishReason::ToolCalls => "tool_use",
        FinishReason::ContentFilter => "refusal",
        FinishReason::Error | FinishReason::Unknown => "end_turn",
    };
    Ok(serde_json::json!({
        "id": response.id,
        "type": "message",
        "role": "assistant",
        "model": response.model,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": Value::Null,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }
    }))
}

fn encode_responses_response(
    response: &CanonicalResponse,
) -> Result<Value, ConversionError> {
    let mut content = Vec::with_capacity(response.content.len());
    let mut tool_calls = Vec::new();
    let mut reasoning_items = Vec::new();
    for (index, block) in response.content.iter().enumerate() {
        match block {
            ContentBlock::Text { text } => content.push(serde_json::json!({
                "type": "output_text",
                "text": text,
                "annotations": [],
            })),
            ContentBlock::Refusal { text } => content.push(serde_json::json!({
                "type": "refusal",
                "refusal": text,
            })),
            ContentBlock::ToolCall {
                id,
                name,
                arguments,
            } => tool_calls.push(serde_json::json!({
                "type": "function_call",
                "id": format!("fc_{id}"),
                "call_id": id,
                "name": name,
                "arguments": serde_json::to_string(arguments).map_err(|error| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("$.content[{index}]"),
                        format!("failed to encode arguments: {error}"),
                    )
                })?,
                "status": "completed",
            })),
            ContentBlock::Reasoning { text, signature } => {
                reasoning_items.push(serde_json::json!({
                    "type":"reasoning",
                    "id":format!("rs_{}", response.id),
                    "summary":[{"type":"summary_text","text":text}],
                    "encrypted_content":signature,
                }));
            }
            _ => {
                return Err(ConversionError::invalid(
                    "output",
                    format!("$.content[{index}]"),
                    "content block is not representable in Responses yet",
                ))
            }
        }
    }
    let status = match response.finish_reason {
        FinishReason::Length => "incomplete",
        FinishReason::Error => "failed",
        _ => "completed",
    };
    let mut output = Vec::new();
    if !content.is_empty() {
        output.push(serde_json::json!({
            "type": "message",
            "id": format!("{}_message", response.id),
            "status": status,
            "role": "assistant",
            "content": content,
        }));
    }
    output.extend(tool_calls);
    output.extend(reasoning_items);
    let mut body = serde_json::json!({
        "id": response.id,
        "object": "response",
        "created_at": 0,
        "status": status,
        "model": response.model,
        "output": output,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.total_tokens,
        }
    });
    if response.finish_reason == FinishReason::Length {
        body["incomplete_details"] = serde_json::json!({"reason": "max_output_tokens"});
    }
    Ok(body)
}

fn required_string(
    body: &Value,
    field: &'static str,
) -> Result<String, ConversionError> {
    body.get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            ConversionError::invalid(
                "invalid_request",
                format!("$.{field}"),
                "expected a non-empty string",
            )
        })
}

fn text_blocks(
    content: &Value,
    path: &str,
) -> Result<Vec<ContentBlock>, ConversionError> {
    if let Some(text) = content.as_str() {
        return Ok(vec![ContentBlock::Text {
            text: text.to_string(),
        }]);
    }
    let parts = content.as_array().ok_or_else(|| {
        ConversionError::invalid(
            "content",
            path,
            "expected a string or an array of content blocks",
        )
    })?;
    let mut blocks = Vec::with_capacity(parts.len());
    for (index, part) in parts.iter().enumerate() {
        let part_path = format!("{path}[{index}]");
        match part.get("type").and_then(Value::as_str) {
            Some("text") | Some("input_text") | Some("output_text") => {
                let text =
                    part.get("text").and_then(Value::as_str).ok_or_else(|| {
                        ConversionError::invalid(
                            "content",
                            format!("{part_path}.text"),
                            "expected a string",
                        )
                    })?;
                blocks.push(ContentBlock::Text {
                    text: text.to_string(),
                });
            }
            Some("tool_use") => {
                let id = part.get("id").and_then(Value::as_str).ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_calls",
                        format!("{part_path}.id"),
                        "expected a string",
                    )
                })?;
                let name =
                    part.get("name").and_then(Value::as_str).ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("{part_path}.name"),
                            "expected a string",
                        )
                    })?;
                blocks.push(ContentBlock::ToolCall {
                    id: id.to_string(),
                    name: name.to_string(),
                    arguments: part
                        .get("input")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({})),
                });
            }
            Some("tool_result") => {
                let tool_call_id = part
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_result",
                            format!("{part_path}.tool_use_id"),
                            "expected a string",
                        )
                    })?;
                let result_content = match part.get("content") {
                    None | Some(Value::Null) => vec![],
                    Some(content) => {
                        text_blocks(content, &format!("{part_path}.content"))?
                    }
                };
                blocks.push(ContentBlock::ToolResult {
                    tool_call_id: tool_call_id.to_string(),
                    content: result_content,
                    is_error: part
                        .get("is_error")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                });
            }
            Some("image_url") | Some("input_image") | Some("image") => {
                let source = if let Some(url) = part
                    .pointer("/image_url/url")
                    .or_else(|| part.get("image_url"))
                    .or_else(|| part.pointer("/source/url"))
                    .and_then(Value::as_str)
                {
                    media_source_from_url(url)
                } else if let Some(file_id) = part
                    .get("file_id")
                    .or_else(|| part.pointer("/source/file_id"))
                    .and_then(Value::as_str)
                {
                    MediaSource::FileId {
                        file_id: file_id.to_string(),
                    }
                } else if part.pointer("/source/type").and_then(Value::as_str)
                    == Some("base64")
                {
                    MediaSource::Base64 {
                        media_type: part
                            .pointer("/source/media_type")
                            .and_then(Value::as_str)
                            .unwrap_or("image/png")
                            .to_string(),
                        data: part
                            .pointer("/source/data")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                ConversionError::invalid(
                                    "vision",
                                    format!("{part_path}.source.data"),
                                    "expected base64 data",
                                )
                            })?
                            .to_string(),
                    }
                } else {
                    return Err(ConversionError::invalid(
                        "vision",
                        part_path,
                        "image requires a URL, file id, or base64 source",
                    ));
                };
                blocks.push(ContentBlock::Image { source });
            }
            Some("input_audio") | Some("audio") => {
                let data = part
                    .pointer("/input_audio/data")
                    .or_else(|| part.pointer("/source/data"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ConversionError::invalid(
                            "audio",
                            format!("{part_path}.input_audio.data"),
                            "expected base64 audio data",
                        )
                    })?;
                let format = part
                    .pointer("/input_audio/format")
                    .or_else(|| part.get("format"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                blocks.push(ContentBlock::Audio {
                    source: MediaSource::Base64 {
                        media_type: format
                            .as_deref()
                            .map(|format| format!("audio/{format}"))
                            .unwrap_or_else(|| "audio/wav".into()),
                        data: data.to_string(),
                    },
                    format,
                });
            }
            Some("input_file") | Some("file") | Some("document") => {
                let filename = part
                    .get("filename")
                    .or_else(|| part.pointer("/file/filename"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                let source = if let Some(file_id) = part
                    .get("file_id")
                    .or_else(|| part.pointer("/file/file_id"))
                    .or_else(|| part.pointer("/source/file_id"))
                    .and_then(Value::as_str)
                {
                    MediaSource::FileId {
                        file_id: file_id.to_string(),
                    }
                } else if let Some(url) = part
                    .get("file_url")
                    .or_else(|| part.pointer("/source/url"))
                    .and_then(Value::as_str)
                {
                    media_source_from_url(url)
                } else {
                    let data = part
                        .get("file_data")
                        .or_else(|| part.pointer("/file/file_data"))
                        .or_else(|| part.pointer("/source/data"))
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            ConversionError::invalid(
                                "file",
                                part_path.clone(),
                                "file requires a file id, URL, or base64 data",
                            )
                        })?;
                    media_source_from_url(data)
                };
                blocks.push(ContentBlock::File { source, filename });
            }
            Some("thinking") | Some("reasoning") => {
                blocks.push(ContentBlock::Reasoning {
                    text: part
                        .get("thinking")
                        .or_else(|| part.get("text"))
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    signature: part
                        .get("signature")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned),
                });
            }
            Some("refusal") => {
                blocks.push(ContentBlock::Refusal {
                    text: part
                        .get("refusal")
                        .or_else(|| part.get("text"))
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                });
            }
            other => {
                return Err(ConversionError::invalid(
                    "content",
                    format!("{part_path}.type"),
                    format!("unsupported content block {other:?}"),
                ))
            }
        }
    }
    Ok(blocks)
}

fn media_source_from_url(value: &str) -> MediaSource {
    if let Some(rest) = value.strip_prefix("data:") {
        if let Some((header, data)) = rest.split_once(',') {
            return MediaSource::Base64 {
                media_type: header.trim_end_matches(";base64").to_string(),
                data: data.to_string(),
            };
        }
    }
    MediaSource::Url {
        url: value.to_string(),
    }
}

fn media_source_to_url(
    source: &MediaSource,
    path: &str,
) -> Result<String, ConversionError> {
    match source {
        MediaSource::Url { url } => Ok(url.clone()),
        MediaSource::Base64 { media_type, data } => {
            Ok(format!("data:{media_type};base64,{data}"))
        }
        MediaSource::FileId { .. } => Err(ConversionError::invalid(
            "media",
            path,
            "file ids cannot be represented as a URL",
        )),
    }
}

fn decode_openai_chat_request(
    body: &Value,
) -> Result<CanonicalRequest, ConversionError> {
    let model = required_string(body, "model")?;
    let raw_messages =
        body.get("messages")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                ConversionError::invalid("messages", "$.messages", "expected an array")
            })?;

    let mut system = Vec::new();
    let mut messages = Vec::new();
    for (index, message) in raw_messages.iter().enumerate() {
        let role = message.get("role").and_then(Value::as_str).ok_or_else(|| {
            ConversionError::invalid(
                "messages",
                format!("$.messages[{index}].role"),
                "expected a role string",
            )
        })?;
        let mut blocks = match message.get("content") {
            Some(Value::Null) | None => vec![],
            Some(content) => {
                text_blocks(content, &format!("$.messages[{index}].content"))?
            }
        };
        if role == "assistant" {
            if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array)
            {
                for (tool_index, tool_call) in tool_calls.iter().enumerate() {
                    let id = tool_call.get("id").and_then(Value::as_str).ok_or_else(
                        || {
                            ConversionError::invalid(
                                "tool_calls",
                                format!(
                                    "$.messages[{index}].tool_calls[{tool_index}].id"
                                ),
                                "expected a string",
                            )
                        },
                    )?;
                    let name = tool_call
                        .pointer("/function/name")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            ConversionError::invalid(
                                "tool_calls",
                                format!(
                                    "$.messages[{index}].tool_calls[{tool_index}].function.name"
                                ),
                                "expected a string",
                            )
                        })?;
                    let arguments_text = tool_call
                        .pointer("/function/arguments")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            ConversionError::invalid(
                                "tool_calls",
                                format!(
                                    "$.messages[{index}].tool_calls[{tool_index}].function.arguments"
                                ),
                                "expected a JSON string",
                            )
                        })?;
                    let arguments = serde_json::from_str(arguments_text).map_err(|error| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!(
                                "$.messages[{index}].tool_calls[{tool_index}].function.arguments"
                            ),
                            format!("invalid JSON arguments: {error}"),
                        )
                    })?;
                    blocks.push(ContentBlock::ToolCall {
                        id: id.to_string(),
                        name: name.to_string(),
                        arguments,
                    });
                }
            }
        }
        match role {
            "system" | "developer" => system.extend(blocks),
            "user" => messages.push(Message {
                role: Role::User,
                content: blocks,
            }),
            "assistant" => messages.push(Message {
                role: Role::Assistant,
                content: blocks,
            }),
            "tool" => {
                let tool_call_id = message
                    .get("tool_call_id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_result",
                        format!("$.messages[{index}].tool_call_id"),
                        "expected a string",
                    )
                })?;
                messages.push(Message {
                    role: Role::User,
                    content: vec![ContentBlock::ToolResult {
                        tool_call_id: tool_call_id.to_string(),
                        content: blocks,
                        is_error: false,
                    }],
                });
            }
            other => {
                return Err(ConversionError::invalid(
                    "messages",
                    format!("$.messages[{index}].role"),
                    format!("unsupported role '{other}'"),
                ))
            }
        }
    }

    let tools = body
        .get("tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .enumerate()
                .map(|(index, tool)| {
                    if tool.get("type").and_then(Value::as_str) != Some("function") {
                        return Err(ConversionError::invalid(
                            "tools",
                            format!("$.tools[{index}].type"),
                            "only function tools are supported",
                        ));
                    }
                    let function = tool.get("function").ok_or_else(|| {
                        ConversionError::invalid(
                            "tools",
                            format!("$.tools[{index}].function"),
                            "function definition is required",
                        )
                    })?;
                    Ok(ToolDefinition {
                        name: function
                            .get("name")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                ConversionError::invalid(
                                    "tools",
                                    format!("$.tools[{index}].function.name"),
                                    "expected a string",
                                )
                            })?
                            .to_string(),
                        description: function
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        input_schema: function
                            .get("parameters")
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!({"type": "object"})),
                        strict: function
                            .get("strict")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    })
                })
                .collect()
        })
        .transpose()?
        .unwrap_or_default();
    let tool_choice = match body.get("tool_choice") {
        None => None,
        Some(Value::String(value)) if value == "auto" => Some(ToolChoice::Auto),
        Some(Value::String(value)) if value == "none" => Some(ToolChoice::None),
        Some(Value::String(value)) if value == "required" => Some(ToolChoice::Required),
        Some(value)
            if value
                .pointer("/function/name")
                .and_then(Value::as_str)
                .is_some() =>
        {
            Some(ToolChoice::Tool {
                name: value
                    .pointer("/function/name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        }
        Some(_) => {
            return Err(ConversionError::invalid(
                "tool_choice",
                "$.tool_choice",
                "unsupported tool choice",
            ))
        }
    };

    let output_format = match body
        .pointer("/response_format/type")
        .and_then(Value::as_str)
    {
        None | Some("text") => None,
        Some("json_object") => Some(OutputFormat::JsonObject),
        Some("json_schema") => Some(OutputFormat::JsonSchema {
            name: body
                .pointer("/response_format/json_schema/name")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "structured_output",
                        "$.response_format.json_schema.name",
                        "expected a string",
                    )
                })?
                .to_string(),
            schema: body
                .pointer("/response_format/json_schema/schema")
                .cloned()
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "structured_output",
                        "$.response_format.json_schema.schema",
                        "schema is required",
                    )
                })?,
            strict: body
                .pointer("/response_format/json_schema/strict")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }),
        Some(other) => {
            return Err(ConversionError::invalid(
                "structured_output",
                "$.response_format.type",
                format!("unsupported response format '{other}'"),
            ))
        }
    };

    let reasoning = body
        .get("reasoning_effort")
        .and_then(Value::as_str)
        .map(|effort| ReasoningConfig {
            effort: Some(effort.to_string()),
            ..ReasoningConfig::default()
        });

    Ok(CanonicalRequest {
        model,
        system,
        messages,
        tools,
        tool_choice,
        output_format,
        reasoning,
        max_output_tokens: body
            .get("max_completion_tokens")
            .or_else(|| body.get("max_tokens"))
            .and_then(Value::as_u64),
        temperature: body.get("temperature").and_then(Value::as_f64),
        top_p: body.get("top_p").and_then(Value::as_f64),
        stop: vec![],
        stream: body.get("stream").and_then(Value::as_bool).unwrap_or(false),
        metadata: body.get("metadata").cloned(),
    })
}

fn decode_anthropic_request(body: &Value) -> Result<CanonicalRequest, ConversionError> {
    let model = required_string(body, "model")?;
    let system = match body.get("system") {
        None => vec![],
        Some(value) => text_blocks(value, "$.system")?,
    };
    let raw_messages =
        body.get("messages")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                ConversionError::invalid("messages", "$.messages", "expected an array")
            })?;
    let mut messages = Vec::with_capacity(raw_messages.len());
    for (index, message) in raw_messages.iter().enumerate() {
        let role = match message.get("role").and_then(Value::as_str) {
            Some("user") => Role::User,
            Some("assistant") => Role::Assistant,
            Some(other) => {
                return Err(ConversionError::invalid(
                    "messages",
                    format!("$.messages[{index}].role"),
                    format!("unsupported role '{other}'"),
                ))
            }
            None => {
                return Err(ConversionError::invalid(
                    "messages",
                    format!("$.messages[{index}].role"),
                    "expected a role string",
                ))
            }
        };
        let content = message.get("content").ok_or_else(|| {
            ConversionError::invalid(
                "messages",
                format!("$.messages[{index}].content"),
                "content is required",
            )
        })?;
        messages.push(Message {
            role,
            content: text_blocks(content, &format!("$.messages[{index}].content"))?,
        });
    }

    let stop = body
        .get("stop_sequences")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let tools = body
        .get("tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .enumerate()
                .map(|(index, tool)| {
                    Ok(ToolDefinition {
                        name: tool
                            .get("name")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                ConversionError::invalid(
                                    "tools",
                                    format!("$.tools[{index}].name"),
                                    "expected a string",
                                )
                            })?
                            .to_string(),
                        description: tool
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        input_schema: tool.get("input_schema").cloned().ok_or_else(
                            || {
                                ConversionError::invalid(
                                    "tools",
                                    format!("$.tools[{index}].input_schema"),
                                    "input schema is required",
                                )
                            },
                        )?,
                        strict: tool
                            .get("strict")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    })
                })
                .collect()
        })
        .transpose()?
        .unwrap_or_default();
    let tool_choice = match body
        .get("tool_choice")
        .and_then(|choice| choice.get("type"))
        .and_then(Value::as_str)
    {
        None => None,
        Some("auto") => Some(ToolChoice::Auto),
        Some("any") => Some(ToolChoice::Required),
        Some("none") => Some(ToolChoice::None),
        Some("tool") => Some(ToolChoice::Tool {
            name: body
                .pointer("/tool_choice/name")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "tool_choice",
                        "$.tool_choice.name",
                        "expected a string",
                    )
                })?
                .to_string(),
        }),
        Some(other) => {
            return Err(ConversionError::invalid(
                "tool_choice",
                "$.tool_choice.type",
                format!("unsupported tool choice '{other}'"),
            ))
        }
    };

    let output_format = match body
        .pointer("/output_config/format/type")
        .and_then(Value::as_str)
    {
        None => None,
        Some("json_schema") => Some(OutputFormat::JsonSchema {
            name: "structured_output".into(),
            schema: body
                .pointer("/output_config/format/schema")
                .cloned()
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "structured_output",
                        "$.output_config.format.schema",
                        "schema is required",
                    )
                })?,
            strict: true,
        }),
        Some(other) => {
            return Err(ConversionError::invalid(
                "structured_output",
                "$.output_config.format.type",
                format!("unsupported output format '{other}'"),
            ))
        }
    };

    let reasoning = if body.get("thinking").is_some()
        || body.pointer("/output_config/effort").is_some()
    {
        Some(ReasoningConfig {
            effort: body
                .pointer("/output_config/effort")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            max_tokens: body
                .pointer("/thinking/budget_tokens")
                .and_then(Value::as_u64),
            summary: None,
        })
    } else {
        None
    };

    Ok(CanonicalRequest {
        model,
        system,
        messages,
        tools,
        tool_choice,
        output_format,
        reasoning,
        max_output_tokens: body.get("max_tokens").and_then(Value::as_u64),
        temperature: body.get("temperature").and_then(Value::as_f64),
        top_p: body.get("top_p").and_then(Value::as_f64),
        stop,
        stream: body.get("stream").and_then(Value::as_bool).unwrap_or(false),
        metadata: body.get("metadata").cloned(),
    })
}

fn decode_responses_request(body: &Value) -> Result<CanonicalRequest, ConversionError> {
    let model = required_string(body, "model")?;
    let system = match body.get("instructions") {
        None => vec![],
        Some(value) => text_blocks(value, "$.instructions")?,
    };
    let input = body.get("input").ok_or_else(|| {
        ConversionError::invalid("input", "$.input", "input is required")
    })?;
    let messages = if input.is_string() {
        vec![Message {
            role: Role::User,
            content: text_blocks(input, "$.input")?,
        }]
    } else if let Some(items) = input.as_array() {
        let mut messages = Vec::new();
        for (index, item) in items.iter().enumerate() {
            // OpenAI Responses API 中带 `role` 字段的 item 即为 message，
            // `type` 字段可省略（Cherry Studio 等客户端不发送 "type": "message"）。
            let item_type = item
                .get("type")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| {
                    if item.get("role").is_some() {
                        "message".to_owned()
                    } else {
                        String::new()
                    }
                });
            match item_type.as_str() {
                "message" => {
                    let role = match item.get("role").and_then(Value::as_str) {
                        Some("user") => Role::User,
                        Some("assistant") => Role::Assistant,
                        other => {
                            return Err(ConversionError::invalid(
                                "input",
                                format!("$.input[{index}].role"),
                                format!("unsupported role {other:?}"),
                            ))
                        }
                    };
                    messages.push(Message {
                        role,
                        content: text_blocks(
                            item.get("content").ok_or_else(|| {
                                ConversionError::invalid(
                                    "input",
                                    format!("$.input[{index}].content"),
                                    "content is required",
                                )
                            })?,
                            &format!("$.input[{index}].content"),
                        )?,
                    });
                }
                "function_call" => {
                    let arguments_text = item
                        .get("arguments")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.input[{index}].arguments"),
                            "expected a JSON string",
                        )
                    })?;
                    messages.push(Message {
                        role: Role::Assistant,
                        content: vec![ContentBlock::ToolCall {
                            id: item
                                .get("call_id")
                                .or_else(|| item.get("id"))
                                .and_then(Value::as_str)
                                .unwrap_or("call_melody")
                                .to_string(),
                            name: item
                                .get("name")
                                .and_then(Value::as_str)
                                .ok_or_else(|| {
                                    ConversionError::invalid(
                                        "tool_calls",
                                        format!("$.input[{index}].name"),
                                        "expected a string",
                                    )
                                })?
                                .to_string(),
                            arguments: serde_json::from_str(arguments_text).map_err(
                                |error| {
                                    ConversionError::invalid(
                                        "tool_calls",
                                        format!("$.input[{index}].arguments"),
                                        format!("invalid JSON arguments: {error}"),
                                    )
                                },
                            )?,
                        }],
                    });
                }
                "function_call_output" => {
                    messages.push(Message {
                        role: Role::User,
                        content: vec![ContentBlock::ToolResult {
                            tool_call_id: item
                                .get("call_id")
                                .and_then(Value::as_str)
                                .ok_or_else(|| {
                                    ConversionError::invalid(
                                        "tool_result",
                                        format!("$.input[{index}].call_id"),
                                        "expected a string",
                                    )
                                })?
                                .to_string(),
                            content: text_blocks(
                                item.get("output").unwrap_or(&Value::Null),
                                &format!("$.input[{index}].output"),
                            )?,
                            is_error: false,
                        }],
                    });
                }
                other => {
                    return Err(ConversionError::invalid(
                        "input",
                        format!("$.input[{index}].type"),
                        format!("unsupported Responses input item {other:?}"),
                    ))
                }
            }
        }
        messages
    } else {
        return Err(ConversionError::invalid(
            "input",
            "$.input",
            "expected a string or array",
        ));
    };

    let tools = body
        .get("tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .enumerate()
                .map(|(index, tool)| {
                    if tool.get("type").and_then(Value::as_str) != Some("function") {
                        return Err(ConversionError::invalid(
                            "tools",
                            format!("$.tools[{index}].type"),
                            "only function tools are supported across protocols",
                        ));
                    }
                    Ok(ToolDefinition {
                        name: tool
                            .get("name")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                ConversionError::invalid(
                                    "tools",
                                    format!("$.tools[{index}].name"),
                                    "expected a string",
                                )
                            })?
                            .to_string(),
                        description: tool
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        input_schema: tool
                            .get("parameters")
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!({"type":"object"})),
                        strict: tool
                            .get("strict")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    })
                })
                .collect()
        })
        .transpose()?
        .unwrap_or_default();
    let tool_choice = match body.get("tool_choice") {
        None => None,
        Some(Value::String(value)) if value == "auto" => Some(ToolChoice::Auto),
        Some(Value::String(value)) if value == "none" => Some(ToolChoice::None),
        Some(Value::String(value)) if value == "required" => Some(ToolChoice::Required),
        Some(value) if value.get("name").and_then(Value::as_str).is_some() => {
            Some(ToolChoice::Tool {
                name: value
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        }
        Some(_) => {
            return Err(ConversionError::invalid(
                "tool_choice",
                "$.tool_choice",
                "unsupported tool choice",
            ))
        }
    };

    let output_format = match body.pointer("/text/format/type").and_then(Value::as_str) {
        None | Some("text") => None,
        Some("json_object") => Some(OutputFormat::JsonObject),
        Some("json_schema") => Some(OutputFormat::JsonSchema {
            name: body
                .pointer("/text/format/name")
                .and_then(Value::as_str)
                .unwrap_or("structured_output")
                .to_string(),
            schema: body
                .pointer("/text/format/schema")
                .cloned()
                .ok_or_else(|| {
                    ConversionError::invalid(
                        "structured_output",
                        "$.text.format.schema",
                        "schema is required",
                    )
                })?,
            strict: body
                .pointer("/text/format/strict")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }),
        Some(other) => {
            return Err(ConversionError::invalid(
                "structured_output",
                "$.text.format.type",
                format!("unsupported output format '{other}'"),
            ))
        }
    };

    let reasoning = body.get("reasoning").map(|_| ReasoningConfig {
        effort: body
            .pointer("/reasoning/effort")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        max_tokens: None,
        summary: body
            .pointer("/reasoning/summary")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    });

    Ok(CanonicalRequest {
        model,
        system,
        messages,
        tools,
        tool_choice,
        output_format,
        reasoning,
        max_output_tokens: body.get("max_output_tokens").and_then(Value::as_u64),
        temperature: body.get("temperature").and_then(Value::as_f64),
        top_p: body.get("top_p").and_then(Value::as_f64),
        stop: vec![],
        stream: body.get("stream").and_then(Value::as_bool).unwrap_or(false),
        metadata: body.get("metadata").cloned(),
    })
}

fn canonical_blocks_to_openai_chat(
    blocks: &[ContentBlock],
    path: &str,
) -> Result<Value, ConversionError> {
    if let [ContentBlock::Text { text }] = blocks {
        return Ok(Value::String(text.clone()));
    }
    let parts = blocks
        .iter()
        .enumerate()
        .map(|(index, block)| match block {
            ContentBlock::Text { text } => {
                Ok(serde_json::json!({"type": "text", "text": text}))
            }
            ContentBlock::Image { source } => Ok(serde_json::json!({
                "type": "image_url",
                "image_url": {
                    "url": media_source_to_url(source, &format!("{path}[{index}]"))?
                }
            })),
            ContentBlock::Audio { source, format } => {
                let MediaSource::Base64 { data, .. } = source else {
                    return Err(ConversionError::invalid(
                        "audio",
                        format!("{path}[{index}]"),
                        "OpenAI Chat input audio requires inline base64 data",
                    ));
                };
                Ok(serde_json::json!({
                    "type":"input_audio",
                    "input_audio":{
                        "data":data,
                        "format":format.as_deref().unwrap_or("wav")
                    }
                }))
            }
            ContentBlock::File { source, filename } => {
                let file = match source {
                    MediaSource::FileId { file_id } => {
                        serde_json::json!({"file_id":file_id,"filename":filename})
                    }
                    _ => serde_json::json!({
                        "file_data":media_source_to_url(source, &format!("{path}[{index}]"))?,
                        "filename":filename
                    }),
                };
                Ok(serde_json::json!({"type":"file","file":file}))
            }
            ContentBlock::Reasoning { text, .. } => {
                Ok(serde_json::json!({"type":"text","text":text}))
            }
            ContentBlock::Refusal { text } => {
                Ok(serde_json::json!({"type":"text","text":text}))
            }
            ContentBlock::ToolCall { .. } | ContentBlock::ToolResult { .. } => {
                Err(ConversionError::invalid(
                    "content",
                    format!("{path}[{index}]"),
                    "tool blocks must be encoded in protocol-specific fields",
                ))
            }
        })
        .collect::<Result<Vec<_>, ConversionError>>()?;
    Ok(Value::Array(parts))
}

fn canonical_blocks_to_plain_text(
    blocks: &[ContentBlock],
    path: &str,
) -> Result<String, ConversionError> {
    blocks
        .iter()
        .enumerate()
        .map(|(index, block)| match block {
            ContentBlock::Text { text } => Ok(text.clone()),
            _ => Err(ConversionError::invalid(
                "content",
                format!("{path}[{index}]"),
                "only text tool results are portable across all three protocols",
            )),
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|parts| parts.join("\n"))
}

fn encode_openai_chat_request(
    request: &CanonicalRequest,
) -> Result<Value, ConversionError> {
    let mut body = Map::new();
    body.insert("model".into(), Value::String(request.model.clone()));
    let mut messages = Vec::new();
    if !request.system.is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": canonical_blocks_to_openai_chat(
                &request.system,
                "$.system",
            )?
        }));
    }
    for (index, message) in request.messages.iter().enumerate() {
        match message.role {
            Role::Assistant => {
                let mut normal_blocks = Vec::new();
                let mut tool_calls = Vec::new();
                for (block_index, block) in message.content.iter().enumerate() {
                    match block {
                        ContentBlock::ToolCall {
                            id,
                            name,
                            arguments,
                        } => tool_calls.push(serde_json::json!({
                            "id": id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": serde_json::to_string(arguments)
                                    .map_err(|error| ConversionError::invalid(
                                        "tool_calls",
                                        format!("$.messages[{index}].content[{block_index}]"),
                                        format!("failed to encode arguments: {error}"),
                                    ))?,
                            }
                        })),
                        other => normal_blocks.push(other.clone()),
                    }
                }
                let content = if normal_blocks.is_empty() {
                    Value::Null
                } else {
                    canonical_blocks_to_openai_chat(
                        &normal_blocks,
                        &format!("$.messages[{index}].content"),
                    )?
                };
                let mut encoded = serde_json::json!({
                    "role": "assistant",
                    "content": content,
                });
                if !tool_calls.is_empty() {
                    encoded["tool_calls"] = Value::Array(tool_calls);
                }
                messages.push(encoded);
            }
            Role::User => {
                let mut normal_blocks = Vec::new();
                for (block_index, block) in message.content.iter().enumerate() {
                    match block {
                        ContentBlock::ToolResult {
                            tool_call_id,
                            content,
                            ..
                        } => {
                            if !normal_blocks.is_empty() {
                                messages.push(serde_json::json!({
                                    "role": "user",
                                    "content": canonical_blocks_to_openai_chat(
                                        &normal_blocks,
                                        &format!("$.messages[{index}].content"),
                                    )?
                                }));
                                normal_blocks.clear();
                            }
                            messages.push(serde_json::json!({
                                "role": "tool",
                                "tool_call_id": tool_call_id,
                                "content": canonical_blocks_to_openai_chat(
                                    content,
                                    &format!(
                                        "$.messages[{index}].content[{block_index}].content"
                                    ),
                                )?
                            }));
                        }
                        other => normal_blocks.push(other.clone()),
                    }
                }
                if !normal_blocks.is_empty() {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": canonical_blocks_to_openai_chat(
                            &normal_blocks,
                            &format!("$.messages[{index}].content"),
                        )?
                    }));
                }
            }
        }
    }
    body.insert("messages".into(), Value::Array(messages));
    if !request.tools.is_empty() {
        body.insert(
            "tools".into(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        serde_json::json!({
                            "type": "function",
                            "function": {
                                "name": tool.name,
                                "description": tool.description,
                                "parameters": tool.input_schema,
                                "strict": tool.strict,
                            }
                        })
                    })
                    .collect(),
            ),
        );
    }
    if let Some(tool_choice) = &request.tool_choice {
        body.insert(
            "tool_choice".into(),
            match tool_choice {
                ToolChoice::Auto => Value::String("auto".into()),
                ToolChoice::None => Value::String("none".into()),
                ToolChoice::Required => Value::String("required".into()),
                ToolChoice::Tool { name } => serde_json::json!({
                    "type": "function",
                    "function": {"name": name},
                }),
            },
        );
    }
    if let Some(output_format) = &request.output_format {
        body.insert(
            "response_format".into(),
            match output_format {
                OutputFormat::Text => serde_json::json!({"type": "text"}),
                OutputFormat::JsonObject => {
                    serde_json::json!({"type": "json_object"})
                }
                OutputFormat::JsonSchema {
                    name,
                    schema,
                    strict,
                } => serde_json::json!({
                    "type": "json_schema",
                    "json_schema": {
                        "name": name,
                        "schema": schema,
                        "strict": strict,
                    }
                }),
            },
        );
    }
    if let Some(reasoning) = &request.reasoning {
        if let Some(effort) = &reasoning.effort {
            body.insert("reasoning_effort".into(), Value::String(effort.clone()));
        } else if reasoning.max_tokens.is_some() {
            return Err(ConversionError::invalid(
                "reasoning",
                "$.thinking.budget_tokens",
                "OpenAI Chat cannot losslessly represent a reasoning token budget",
            ));
        }
    }
    if let Some(max_tokens) = request.max_output_tokens {
        body.insert("max_tokens".into(), Value::from(max_tokens));
    }
    if let Some(temperature) = request.temperature {
        body.insert("temperature".into(), Value::from(temperature));
    }
    if let Some(top_p) = request.top_p {
        body.insert("top_p".into(), Value::from(top_p));
    }
    if !request.stop.is_empty() {
        body.insert(
            "stop".into(),
            Value::Array(request.stop.iter().cloned().map(Value::String).collect()),
        );
    }
    if request.stream {
        body.insert("stream".into(), Value::Bool(true));
    }
    Ok(Value::Object(body))
}

fn canonical_blocks_to_anthropic(
    blocks: &[ContentBlock],
    path: &str,
) -> Result<Vec<Value>, ConversionError> {
    blocks
        .iter()
        .enumerate()
        .map(|(index, block)| match block {
            ContentBlock::Text { text } => {
                Ok(serde_json::json!({"type": "text", "text": text}))
            }
            ContentBlock::ToolCall {
                id,
                name,
                arguments,
            } => Ok(serde_json::json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": arguments,
            })),
            ContentBlock::ToolResult {
                tool_call_id,
                content,
                is_error,
            } => Ok(serde_json::json!({
                "type": "tool_result",
                "tool_use_id": tool_call_id,
                "content": canonical_blocks_to_anthropic(
                    content,
                    &format!("{path}[{index}].content"),
                )?,
                "is_error": is_error,
            })),
            ContentBlock::Image { source } => {
                let source = match source {
                    MediaSource::Url { url } => {
                        serde_json::json!({"type":"url","url":url})
                    }
                    MediaSource::Base64 { media_type, data } => {
                        serde_json::json!({"type":"base64","media_type":media_type,"data":data})
                    }
                    MediaSource::FileId { file_id } => {
                        serde_json::json!({"type":"file","file_id":file_id})
                    }
                };
                Ok(serde_json::json!({"type":"image","source":source}))
            }
            ContentBlock::File { source, filename } => {
                let source = match source {
                    MediaSource::Url { url } => {
                        serde_json::json!({"type":"url","url":url})
                    }
                    MediaSource::Base64 { media_type, data } => {
                        serde_json::json!({"type":"base64","media_type":media_type,"data":data})
                    }
                    MediaSource::FileId { file_id } => {
                        serde_json::json!({"type":"file","file_id":file_id})
                    }
                };
                Ok(serde_json::json!({
                    "type":"document",
                    "source":source,
                    "title":filename
                }))
            }
            ContentBlock::Audio { .. } => Err(ConversionError::invalid(
                "audio",
                format!("{path}[{index}]"),
                "Anthropic Messages does not provide a portable audio content block",
            )),
            ContentBlock::Reasoning { text, signature } => Ok(serde_json::json!({
                "type":"thinking",
                "thinking":text,
                "signature":signature,
            })),
            ContentBlock::Refusal { text } => {
                Ok(serde_json::json!({"type":"text","text":text}))
            }
        })
        .collect()
}

fn encode_anthropic_request(
    request: &CanonicalRequest,
) -> Result<Value, ConversionError> {
    let mut body = Map::new();
    body.insert("model".into(), Value::String(request.model.clone()));
    if !request.system.is_empty() {
        body.insert(
            "system".into(),
            Value::Array(canonical_blocks_to_anthropic(&request.system, "$.system")?),
        );
    }
    let messages = request
        .messages
        .iter()
        .enumerate()
        .map(|(index, message)| {
            Ok(serde_json::json!({
                "role": match message.role {
                    Role::User => "user",
                    Role::Assistant => "assistant",
                },
                "content": canonical_blocks_to_anthropic(
                    &message.content,
                    &format!("$.messages[{index}].content"),
                )?
            }))
        })
        .collect::<Result<Vec<_>, ConversionError>>()?;
    body.insert("messages".into(), Value::Array(messages));
    if !request.tools.is_empty() {
        body.insert(
            "tools".into(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        serde_json::json!({
                            "name": tool.name,
                            "description": tool.description,
                            "input_schema": tool.input_schema,
                            "strict": tool.strict,
                        })
                    })
                    .collect(),
            ),
        );
    }
    if let Some(tool_choice) = &request.tool_choice {
        let value = match tool_choice {
            ToolChoice::Auto => serde_json::json!({"type": "auto"}),
            ToolChoice::Required => serde_json::json!({"type": "any"}),
            ToolChoice::Tool { name } => {
                serde_json::json!({"type": "tool", "name": name})
            }
            ToolChoice::None => serde_json::json!({"type": "none"}),
        };
        body.insert("tool_choice".into(), value);
    }
    if let Some(output_format) = &request.output_format {
        match output_format {
            OutputFormat::Text => {}
            OutputFormat::JsonSchema { schema, .. } => {
                body.insert(
                    "output_config".into(),
                    serde_json::json!({
                        "format": {
                            "type": "json_schema",
                            "schema": schema,
                        }
                    }),
                );
            }
            OutputFormat::JsonObject => {
                return Err(ConversionError::invalid(
                    "structured_output",
                    "$.response_format",
                    "Anthropic requires a JSON Schema for structured output",
                ))
            }
        }
    }
    if let Some(reasoning) = &request.reasoning {
        if let Some(max_tokens) = reasoning.max_tokens {
            body.insert(
                "thinking".into(),
                serde_json::json!({
                    "type": "enabled",
                    "budget_tokens": max_tokens,
                }),
            );
        } else {
            body.insert("thinking".into(), serde_json::json!({"type": "adaptive"}));
        }
        if let Some(effort) = &reasoning.effort {
            let output_config = body
                .entry("output_config")
                .or_insert_with(|| serde_json::json!({}));
            let output_config = output_config.as_object_mut().ok_or_else(|| {
                ConversionError::invalid(
                    "reasoning",
                    "$.output_config",
                    "expected an object",
                )
            })?;
            output_config.insert("effort".into(), Value::String(effort.clone()));
        }
    }
    if let Some(max_tokens) = request.max_output_tokens {
        body.insert("max_tokens".into(), Value::from(max_tokens));
    }
    if let Some(temperature) = request.temperature {
        body.insert("temperature".into(), Value::from(temperature));
    }
    if let Some(top_p) = request.top_p {
        body.insert("top_p".into(), Value::from(top_p));
    }
    if request.stream {
        body.insert("stream".into(), Value::Bool(true));
    }
    Ok(Value::Object(body))
}

fn encode_responses_request(
    request: &CanonicalRequest,
) -> Result<Value, ConversionError> {
    let mut body = Map::new();
    body.insert("model".into(), Value::String(request.model.clone()));
    if !request.system.is_empty() {
        let mut instruction_parts = Vec::with_capacity(request.system.len());
        for (index, block) in request.system.iter().enumerate() {
            match block {
                ContentBlock::Text { text } => instruction_parts.push(text.clone()),
                _ => {
                    return Err(ConversionError::invalid(
                        "instructions",
                        format!("$.system[{index}]"),
                        "non-text system content cannot be represented as Responses instructions",
                    ))
                }
            }
        }
        body.insert(
            "instructions".into(),
            Value::String(instruction_parts.join("\n")),
        );
    }

    let mut input = Vec::with_capacity(request.messages.len());
    for (message_index, message) in request.messages.iter().enumerate() {
        let role = match message.role {
            Role::User => "user",
            Role::Assistant => "assistant",
        };
        let mut content = Vec::with_capacity(message.content.len());
        let mut special_items = Vec::new();
        for (block_index, block) in message.content.iter().enumerate() {
            match block {
                ContentBlock::Text { text } => content.push(serde_json::json!({
                    "type": if message.role == Role::Assistant {
                        "output_text"
                    } else {
                        "input_text"
                    },
                    "text": text
                })),
                ContentBlock::Image { source } => match source {
                    MediaSource::FileId { file_id } => {
                        content.push(serde_json::json!({
                            "type":"input_image",
                            "file_id":file_id
                        }));
                    }
                    _ => content.push(serde_json::json!({
                        "type":"input_image",
                        "image_url":media_source_to_url(
                            source,
                            &format!("$.messages[{message_index}].content[{block_index}]")
                        )?
                    })),
                },
                ContentBlock::File { source, filename } => match source {
                    MediaSource::FileId { file_id } => {
                        content.push(serde_json::json!({
                            "type":"input_file",
                            "file_id":file_id,
                            "filename":filename
                        }));
                    }
                    _ => content.push(serde_json::json!({
                        "type":"input_file",
                        "file_data":media_source_to_url(
                            source,
                            &format!("$.messages[{message_index}].content[{block_index}]")
                        )?,
                        "filename":filename
                    })),
                },
                ContentBlock::Audio { source, format } => {
                    let MediaSource::Base64 { data, .. } = source else {
                        return Err(ConversionError::invalid(
                            "audio",
                            format!("$.messages[{message_index}].content[{block_index}]"),
                            "Responses input audio requires inline base64 data",
                        ));
                    };
                    content.push(serde_json::json!({
                        "type":"input_audio",
                        "input_audio":{
                            "data":data,
                            "format":format.as_deref().unwrap_or("wav")
                        }
                    }));
                }
                ContentBlock::Reasoning { text, signature } => {
                    special_items.push(serde_json::json!({
                        "type":"reasoning",
                        "summary":[{"type":"summary_text","text":text}],
                        "encrypted_content":signature,
                    }));
                }
                ContentBlock::Refusal { text } => content.push(serde_json::json!({
                    "type":"refusal",
                    "refusal":text
                })),
                ContentBlock::ToolCall {
                    id,
                    name,
                    arguments,
                } => special_items.push(serde_json::json!({
                    "type": "function_call",
                    "call_id": id,
                    "name": name,
                    "arguments": serde_json::to_string(arguments).map_err(|error| {
                        ConversionError::invalid(
                            "tool_calls",
                            format!("$.messages[{message_index}].content[{block_index}]"),
                            format!("failed to encode arguments: {error}"),
                        )
                    })?,
                })),
                ContentBlock::ToolResult {
                    tool_call_id,
                    content,
                    ..
                } => {
                    let output = canonical_blocks_to_plain_text(
                        content,
                        &format!(
                            "$.messages[{message_index}].content[{block_index}].content"
                        ),
                    )?;
                    special_items.push(serde_json::json!({
                        "type": "function_call_output",
                        "call_id": tool_call_id,
                        "output": output,
                    }));
                }
            }
        }
        if !content.is_empty() {
            input.push(serde_json::json!({
                "type": "message",
                "role": role,
                "content": content,
            }));
        }
        input.extend(special_items);
    }
    body.insert("input".into(), Value::Array(input));
    if !request.tools.is_empty() {
        body.insert(
            "tools".into(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        serde_json::json!({
                            "type": "function",
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.input_schema,
                            "strict": tool.strict,
                        })
                    })
                    .collect(),
            ),
        );
    }
    if let Some(tool_choice) = &request.tool_choice {
        body.insert(
            "tool_choice".into(),
            match tool_choice {
                ToolChoice::Auto => Value::String("auto".into()),
                ToolChoice::None => Value::String("none".into()),
                ToolChoice::Required => Value::String("required".into()),
                ToolChoice::Tool { name } => {
                    serde_json::json!({"type":"function","name":name})
                }
            },
        );
    }
    if let Some(output_format) = &request.output_format {
        body.insert(
            "text".into(),
            serde_json::json!({
                "format": match output_format {
                    OutputFormat::Text => serde_json::json!({"type": "text"}),
                    OutputFormat::JsonObject => {
                        serde_json::json!({"type": "json_object"})
                    }
                    OutputFormat::JsonSchema {
                        name,
                        schema,
                        strict,
                    } => serde_json::json!({
                        "type": "json_schema",
                        "name": name,
                        "schema": schema,
                        "strict": strict,
                    }),
                }
            }),
        );
    }
    if let Some(reasoning) = &request.reasoning {
        if reasoning.max_tokens.is_some() && reasoning.effort.is_none() {
            return Err(ConversionError::invalid(
                "reasoning",
                "$.thinking.budget_tokens",
                "Responses cannot losslessly represent a reasoning token budget",
            ));
        }
        let mut config = Map::new();
        if let Some(effort) = &reasoning.effort {
            config.insert("effort".into(), Value::String(effort.clone()));
        }
        if let Some(summary) = &reasoning.summary {
            config.insert("summary".into(), Value::String(summary.clone()));
        }
        body.insert("reasoning".into(), Value::Object(config));
    }
    if let Some(max_tokens) = request.max_output_tokens {
        body.insert("max_output_tokens".into(), Value::from(max_tokens));
    }
    if let Some(temperature) = request.temperature {
        body.insert("temperature".into(), Value::from(temperature));
    }
    if let Some(top_p) = request.top_p {
        body.insert("top_p".into(), Value::from(top_p));
    }
    if request.stream {
        body.insert("stream".into(), Value::Bool(true));
    }
    Ok(Value::Object(body))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn openai_chat_text_request_converts_to_anthropic_messages() {
        let input = json!({
            "model": "gpt-4o",
            "messages": [
                {"role": "system", "content": "Be concise."},
                {"role": "user", "content": "Hello"}
            ],
            "max_tokens": 128,
            "temperature": 0.2,
            "stream": true
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .expect("request should be representable");

        assert_eq!(
            converted,
            json!({
                "model": "gpt-4o",
                "system": [{"type": "text", "text": "Be concise."}],
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Hello"}]
                    }
                ],
                "max_tokens": 128,
                "temperature": 0.2,
                "stream": true
            })
        );
    }

    #[test]
    fn openai_chat_tools_round_trip_through_responses_shape() {
        let input = json!({
            "model": "gpt-4o",
            "messages": [
                {"role":"user","content":"Weather?"},
                {"role":"assistant","content":null,"tool_calls":[{
                    "id":"call_1","type":"function",
                    "function":{"name":"weather","arguments":"{\"city\":\"Shanghai\"}"}
                }]},
                {"role":"tool","tool_call_id":"call_1","content":"sunny"}
            ],
            "tools":[{
                "type":"function",
                "function":{
                    "name":"weather",
                    "description":"Get weather",
                    "parameters":{"type":"object"},
                    "strict":true
                }
            }],
            "tool_choice":{"type":"function","function":{"name":"weather"}}
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        )
        .unwrap();

        assert_eq!(converted["tools"][0]["name"], "weather");
        assert_eq!(converted["tools"][0]["strict"], true);
        assert_eq!(converted["tool_choice"]["name"], "weather");
        assert!(converted["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["type"] == "function_call"));
        assert!(converted["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["type"] == "function_call_output"));
    }

    #[test]
    fn responses_function_call_response_converts_to_anthropic() {
        let input = json!({
            "id":"resp_1",
            "model":"gpt-5",
            "status":"completed",
            "output":[{
                "type":"function_call",
                "id":"fc_1",
                "call_id":"call_1",
                "name":"weather",
                "arguments":"{\"city\":\"Shanghai\"}"
            }],
            "usage":{"input_tokens":5,"output_tokens":3,"total_tokens":8}
        });
        let converted = convert_response(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::AnthropicMessages,
        )
        .unwrap();

        assert_eq!(converted["content"][0]["type"], "tool_use");
        assert_eq!(converted["content"][0]["id"], "call_1");
        assert_eq!(converted["content"][0]["input"]["city"], "Shanghai");
    }

    #[test]
    fn openai_chat_image_converts_to_anthropic_and_responses() {
        let input = json!({
            "model":"vision-model",
            "messages":[{
                "role":"user",
                "content":[
                    {"type":"text","text":"Describe this"},
                    {"type":"image_url","image_url":{"url":"data:image/png;base64,aGVsbG8="}}
                ]
            }]
        });
        let anthropic = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .unwrap();
        assert_eq!(anthropic["messages"][0]["content"][1]["type"], "image");
        assert_eq!(
            anthropic["messages"][0]["content"][1]["source"]["media_type"],
            "image/png"
        );

        let responses = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        )
        .unwrap();
        assert_eq!(responses["input"][0]["content"][1]["type"], "input_image");
        assert_eq!(
            responses["input"][0]["content"][1]["image_url"],
            "data:image/png;base64,aGVsbG8="
        );
    }

    #[test]
    fn sdk_shaped_text_contract_covers_full_three_by_three_matrix() {
        let requests = [
            (
                ProtocolKind::OpenAiChat,
                json!({"model":"m","messages":[{"role":"user","content":"hello"}]}),
            ),
            (
                ProtocolKind::AnthropicMessages,
                json!({"model":"m","max_tokens":64,"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]}),
            ),
            (
                ProtocolKind::OpenAiResponses,
                json!({"model":"m","input":"hello"}),
            ),
        ];
        for (source, request) in &requests {
            for target in [
                ProtocolKind::OpenAiChat,
                ProtocolKind::AnthropicMessages,
                ProtocolKind::OpenAiResponses,
            ] {
                let converted = convert_request(request, *source, target)
                    .unwrap_or_else(|error| panic!("{source:?} -> {target:?}: {error}"));
                assert_eq!(converted["model"], "m");
                match target {
                    ProtocolKind::OpenAiChat => {
                        assert!(converted["messages"].is_array())
                    }
                    ProtocolKind::AnthropicMessages => {
                        assert!(converted["messages"].is_array())
                    }
                    ProtocolKind::OpenAiResponses => {
                        assert!(converted.get("input").is_some())
                    }
                }
            }
        }

        let responses = [
            (
                ProtocolKind::OpenAiChat,
                json!({"id":"chat_1","model":"m","choices":[{"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}),
            ),
            (
                ProtocolKind::AnthropicMessages,
                json!({"id":"msg_1","model":"m","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}),
            ),
            (
                ProtocolKind::OpenAiResponses,
                json!({"id":"resp_1","model":"m","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}),
            ),
        ];
        for (source, response) in &responses {
            for target in [
                ProtocolKind::OpenAiChat,
                ProtocolKind::AnthropicMessages,
                ProtocolKind::OpenAiResponses,
            ] {
                let converted = convert_response(response, *source, target)
                    .unwrap_or_else(|error| panic!("{source:?} -> {target:?}: {error}"));
                assert_eq!(converted["model"], "m");
                match target {
                    ProtocolKind::OpenAiChat => assert!(converted["choices"].is_array()),
                    ProtocolKind::AnthropicMessages => {
                        assert!(converted["content"].is_array())
                    }
                    ProtocolKind::OpenAiResponses => {
                        assert!(converted["output"].is_array())
                    }
                }
            }
        }
    }

    #[test]
    fn critical_capabilities_never_silently_drop() {
        let json_object_without_schema = json!({
            "model":"m",
            "messages":[{"role":"user","content":"json"}],
            "response_format":{"type":"json_object"}
        });
        let error = convert_request(
            &json_object_without_schema,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .unwrap_err();
        assert_eq!(error.feature, "structured_output");

        let malformed_tool_arguments = json!({
            "model":"m",
            "messages":[{
                "role":"assistant",
                "tool_calls":[{
                    "id":"call_1",
                    "type":"function",
                    "function":{"name":"tool","arguments":"not-json"}
                }]
            }]
        });
        let error = convert_request(
            &malformed_tool_arguments,
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        )
        .unwrap_err();
        assert_eq!(error.feature, "tool_calls");
    }

    #[test]
    fn anthropic_reasoning_response_preserves_thinking_and_signature() {
        let input = json!({
            "id":"msg_1",
            "model":"claude",
            "content":[
                {"type":"thinking","thinking":"check the facts","signature":"sig_1"},
                {"type":"text","text":"answer"}
            ],
            "stop_reason":"end_turn",
            "usage":{"input_tokens":2,"output_tokens":3}
        });
        let responses = convert_response(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiResponses,
        )
        .unwrap();
        let reasoning = responses["output"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["type"] == "reasoning")
            .unwrap();
        assert_eq!(reasoning["summary"][0]["text"], "check the facts");
        assert_eq!(reasoning["encrypted_content"], "sig_1");
    }

    #[test]
    fn anthropic_text_request_converts_to_openai_chat() {
        let input = json!({
            "model": "claude-sonnet",
            "system": [{"type": "text", "text": "Be precise."}],
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "Hello"}]
                }
            ],
            "max_tokens": 256,
            "stop_sequences": ["END"]
        });

        let converted = convert_request(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        )
        .expect("request should be representable");

        assert_eq!(
            converted,
            json!({
                "model": "claude-sonnet",
                "messages": [
                    {"role": "system", "content": "Be precise."},
                    {"role": "user", "content": "Hello"}
                ],
                "max_tokens": 256,
                "stop": ["END"]
            })
        );
    }

    #[test]
    fn responses_text_request_converts_to_anthropic_messages() {
        let input = json!({
            "model": "gpt-5",
            "instructions": "Be concise.",
            "input": "Hello",
            "max_output_tokens": 64,
            "stream": true
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::AnthropicMessages,
        )
        .expect("request should be representable");

        assert_eq!(
            converted,
            json!({
                "model": "gpt-5",
                "system": [{"type": "text", "text": "Be concise."}],
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": "Hello"}]
                }],
                "max_tokens": 64,
                "stream": true
            })
        );
    }

    #[test]
    fn responses_input_items_without_type_field_are_treated_as_messages() {
        // Cherry Studio 等 OpenAI SDK 客户端发送的 input item
        // 只带 `role` 而不带 `type: "message"`，应被识别为 message。
        let input = json!({
            "model": "gpt-5",
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "你好"}]
                },
                {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "你好！"}]
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "你会做什么？"}]
                }
            ],
            "stream": true
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::OpenAiChat,
        )
        .expect("typeless input items should be treated as messages");

        let messages = converted
            .get("messages")
            .and_then(Value::as_array)
            .expect("messages array should exist");
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"], "你好");
        assert_eq!(messages[1]["role"], "assistant");
        assert_eq!(messages[1]["content"], "你好！");
        assert_eq!(messages[2]["role"], "user");
        assert_eq!(messages[2]["content"], "你会做什么？");
    }

    #[test]
    fn openai_chat_text_request_converts_to_responses() {
        let input = json!({
            "model": "gpt-4o",
            "messages": [
                {"role": "developer", "content": "Use metric units."},
                {"role": "user", "content": "Weather?"},
                {"role": "assistant", "content": "Which city?"},
                {"role": "user", "content": "Shanghai"}
            ],
            "max_completion_tokens": 80
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::OpenAiResponses,
        )
        .expect("request should be representable");

        assert_eq!(
            converted,
            json!({
                "model": "gpt-4o",
                "instructions": "Use metric units.",
                "input": [
                    {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "Weather?"}]
                    },
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "Which city?"}]
                    },
                    {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "Shanghai"}]
                    }
                ],
                "max_output_tokens": 80
            })
        );
    }

    #[test]
    fn anthropic_text_request_converts_to_responses() {
        let input = json!({
            "model": "claude-sonnet",
            "system": "Answer plainly.",
            "messages": [{
                "role": "user",
                "content": "Hello"
            }],
            "max_tokens": 40
        });

        let converted = convert_request(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiResponses,
        )
        .expect("request should be representable");

        assert_eq!(converted["instructions"], "Answer plainly.");
        assert_eq!(converted["max_output_tokens"], 40);
        assert_eq!(converted["input"][0]["role"], "user");
        assert_eq!(
            converted["input"][0]["content"][0],
            json!({"type": "input_text", "text": "Hello"})
        );
    }

    #[test]
    fn responses_text_request_converts_to_openai_chat() {
        let input = json!({
            "model": "gpt-5",
            "instructions": "Be concise.",
            "input": "Hello",
            "max_output_tokens": 32
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::OpenAiChat,
        )
        .expect("request should be representable");

        assert_eq!(
            converted,
            json!({
                "model": "gpt-5",
                "messages": [
                    {"role": "system", "content": "Be concise."},
                    {"role": "user", "content": "Hello"}
                ],
                "max_tokens": 32
            })
        );
    }

    #[test]
    fn anthropic_text_response_converts_to_openai_chat() {
        let input = json!({
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet",
            "content": [{"type": "text", "text": "Hello!"}],
            "stop_reason": "end_turn",
            "stop_sequence": null,
            "usage": {"input_tokens": 10, "output_tokens": 4}
        });

        let converted = convert_response(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        )
        .expect("response should be representable");

        assert_eq!(
            converted,
            json!({
                "id": "msg_123",
                "object": "chat.completion",
                "created": 0,
                "model": "claude-sonnet",
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "Hello!"},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 4,
                    "total_tokens": 14
                }
            })
        );
    }

    #[test]
    fn openai_chat_text_response_converts_to_anthropic() {
        let input = json!({
            "id": "chatcmpl_123",
            "object": "chat.completion",
            "model": "gpt-4o",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "length"
            }],
            "usage": {
                "prompt_tokens": 8,
                "completion_tokens": 3,
                "total_tokens": 11
            }
        });

        let converted = convert_response(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .expect("response should be representable");

        assert_eq!(
            converted,
            json!({
                "id": "chatcmpl_123",
                "type": "message",
                "role": "assistant",
                "model": "gpt-4o",
                "content": [{"type": "text", "text": "Hello!"}],
                "stop_reason": "max_tokens",
                "stop_sequence": null,
                "usage": {"input_tokens": 8, "output_tokens": 3}
            })
        );
    }

    #[test]
    fn responses_text_response_converts_to_openai_chat() {
        let input = json!({
            "id": "resp_123",
            "object": "response",
            "status": "completed",
            "model": "gpt-5",
            "output": [{
                "type": "message",
                "id": "msg_1",
                "status": "completed",
                "role": "assistant",
                "content": [{
                    "type": "output_text",
                    "text": "Hello!",
                    "annotations": []
                }]
            }],
            "usage": {
                "input_tokens": 9,
                "output_tokens": 4,
                "total_tokens": 13
            }
        });

        let converted = convert_response(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::OpenAiChat,
        )
        .expect("response should be representable");

        assert_eq!(converted["id"], "resp_123");
        assert_eq!(converted["choices"][0]["message"]["content"], "Hello!");
        assert_eq!(converted["choices"][0]["finish_reason"], "stop");
        assert_eq!(converted["usage"]["total_tokens"], 13);
    }

    #[test]
    fn anthropic_text_response_converts_to_responses() {
        let input = json!({
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet",
            "content": [{"type": "text", "text": "Hello!"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 7, "output_tokens": 3}
        });

        let converted = convert_response(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiResponses,
        )
        .expect("response should be representable");

        assert_eq!(converted["id"], "msg_123");
        assert_eq!(converted["object"], "response");
        assert_eq!(converted["status"], "completed");
        assert_eq!(
            converted["output"][0]["content"][0],
            json!({"type": "output_text", "text": "Hello!", "annotations": []})
        );
        assert_eq!(converted["usage"]["total_tokens"], 10);
    }

    #[test]
    fn openai_tool_round_trip_request_converts_to_anthropic() {
        let input = json!({
            "model": "gpt-4o",
            "messages": [
                {"role": "user", "content": "Weather in Shanghai?"},
                {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "get_weather",
                            "arguments": "{\"city\":\"Shanghai\"}"
                        }
                    }]
                },
                {
                    "role": "tool",
                    "tool_call_id": "call_1",
                    "content": "{\"temperature\":31}"
                }
            ],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get weather",
                    "parameters": {
                        "type": "object",
                        "properties": {"city": {"type": "string"}},
                        "required": ["city"]
                    },
                    "strict": true
                }
            }],
            "tool_choice": "auto"
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .expect("tool calls should be preserved");

        assert_eq!(
            converted["tools"][0],
            json!({
                "name": "get_weather",
                "description": "Get weather",
                "input_schema": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                    "required": ["city"]
                },
                "strict": true
            })
        );
        assert_eq!(
            converted["messages"][1]["content"][0],
            json!({
                "type": "tool_use",
                "id": "call_1",
                "name": "get_weather",
                "input": {"city": "Shanghai"}
            })
        );
        assert_eq!(
            converted["messages"][2]["content"][0],
            json!({
                "type": "tool_result",
                "tool_use_id": "call_1",
                "content": [{"type": "text", "text": "{\"temperature\":31}"}],
                "is_error": false
            })
        );
        assert_eq!(converted["tool_choice"], json!({"type": "auto"}));
    }

    #[test]
    fn anthropic_tool_round_trip_request_converts_to_openai_chat() {
        let input = json!({
            "model": "claude-sonnet",
            "messages": [
                {
                    "role": "assistant",
                    "content": [{
                        "type": "tool_use",
                        "id": "toolu_1",
                        "name": "lookup",
                        "input": {"query": "Melody Hub"}
                    }]
                },
                {
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": "toolu_1",
                        "content": "Found",
                        "is_error": false
                    }]
                }
            ],
            "tools": [{
                "name": "lookup",
                "description": "Search",
                "input_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}}
                }
            }],
            "tool_choice": {"type": "tool", "name": "lookup"},
            "max_tokens": 100
        });

        let converted = convert_request(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        )
        .expect("tool calls should be preserved");

        assert_eq!(
            converted["messages"][0]["tool_calls"][0],
            json!({
                "id": "toolu_1",
                "type": "function",
                "function": {
                    "name": "lookup",
                    "arguments": "{\"query\":\"Melody Hub\"}"
                }
            })
        );
        assert_eq!(
            converted["messages"][1],
            json!({
                "role": "tool",
                "tool_call_id": "toolu_1",
                "content": "Found"
            })
        );
        assert_eq!(
            converted["tools"][0],
            json!({
                "type": "function",
                "function": {
                    "name": "lookup",
                    "description": "Search",
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}}
                    },
                    "strict": false
                }
            })
        );
        assert_eq!(
            converted["tool_choice"],
            json!({
                "type": "function",
                "function": {"name": "lookup"}
            })
        );
    }

    #[test]
    fn anthropic_tool_response_converts_to_openai_chat() {
        let input = json!({
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet",
            "content": [{
                "type": "tool_use",
                "id": "toolu_1",
                "name": "lookup",
                "input": {"query": "Melody Hub"}
            }],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 12, "output_tokens": 8}
        });

        let converted = convert_response(
            &input,
            ProtocolKind::AnthropicMessages,
            ProtocolKind::OpenAiChat,
        )
        .expect("tool response should be preserved");

        assert_eq!(converted["choices"][0]["message"]["content"], Value::Null);
        assert_eq!(
            converted["choices"][0]["message"]["tool_calls"][0],
            json!({
                "id": "toolu_1",
                "type": "function",
                "function": {
                    "name": "lookup",
                    "arguments": "{\"query\":\"Melody Hub\"}"
                }
            })
        );
        assert_eq!(converted["choices"][0]["finish_reason"], "tool_calls");
    }

    #[test]
    fn openai_json_schema_converts_to_anthropic_output_config() {
        let schema = json!({
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": false
        });
        let input = json!({
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": "Answer"}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "answer",
                    "schema": schema,
                    "strict": true
                }
            }
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiChat,
            ProtocolKind::AnthropicMessages,
        )
        .expect("structured output should be preserved");

        assert_eq!(
            converted["output_config"],
            json!({
                "format": {
                    "type": "json_schema",
                    "schema": schema
                }
            })
        );
    }

    #[test]
    fn responses_reasoning_effort_converts_to_anthropic_adaptive_thinking() {
        let input = json!({
            "model": "gpt-5",
            "input": "Solve this.",
            "reasoning": {
                "effort": "high",
                "summary": "auto"
            }
        });

        let converted = convert_request(
            &input,
            ProtocolKind::OpenAiResponses,
            ProtocolKind::AnthropicMessages,
        )
        .expect("adaptive reasoning settings should be representable");

        assert_eq!(converted["thinking"], json!({"type": "adaptive"}));
        assert_eq!(converted["output_config"]["effort"], "high");
    }
}
