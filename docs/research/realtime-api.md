# OpenAI Realtime API: verified notes (2026-10-11, developers.openai.com)

- Model `gpt-realtime-2.1-mini` exists (released 2026-07-06): reasoning-distilled, WebRTC/WebSocket/SIP, function calling, 128K context.
- GA API: no `OpenAI-Beta` header. `session.type: "realtime"` is required. The voice goes in `session.audio.output.voice`.

## Ephemeral key (server)
`POST https://api.openai.com/v1/realtime/client_secrets` with `Authorization: Bearer $OPENAI_API_KEY`
Body: `{ expires_after:{anchor:"created_at",seconds:600}, session:{ type:"realtime", model, instructions, output_modalities:["audio"], reasoning:{effort:"low"}, audio:{ input:{ noise_reduction:{type:"far_field"}, transcription:{model:"gpt-4o-transcribe"}, turn_detection:{type:"semantic_vad", eagerness:"auto", create_response:true, interrupt_response:true} }, output:{ voice:"marin", speed:1.0 } }, tools:[{type:"function",name,description,parameters}], tool_choice:"auto" } }`
Response: `{ value:"ek_...", expires_at, session:{...} }`

## Browser WebRTC
- Create the `oai-events` data channel BEFORE `createOffer`. Add the mic track. `ontrack` gives the remote audio stream.
- `POST https://api.openai.com/v1/realtime/calls` with body = offer SDP and headers `Authorization: Bearer ek_...` and `Content-Type: application/sdp`. The response text is the answer SDP. No `?model` parameter; the model comes from the secret.
- `getUserMedia` and autoplay need a user gesture.

## Events
- Client: `session.update` (must include `session.type:"realtime"`), `conversation.item.create`, `response.create`, `response.cancel`, `output_audio_buffer.clear` (WebRTC).
- Typed text: `conversation.item.create {item:{type:"message",role:"user",content:[{type:"input_text",text}]}}`, then `response.create`.
- Tools: `response.function_call_arguments.done {call_id,name,arguments}` (also appears in `response.done` → `response.output[]` items with `type:"function_call"`). Reply with `conversation.item.create {item:{type:"function_call_output",call_id,output:JSON.stringify(res)}}`, then `response.create`.
- Subtitles: user `conversation.item.input_audio_transcription.delta/.completed`; Buddy `response.output_audio_transcript.delta/.done`.
- Turn-taking: `input_audio_buffer.speech_started/.speech_stopped`, `output_audio_buffer.started/.stopped/.cleared`. Barge-in truncation is automatic over WebRTC.
- Other events: `session.created`, `session.updated`, `response.created`, `response.done`, `error`.

## Voices
`alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar`. The docs recommend `marin`/`cedar`. The voice can't change after the first audio.
Swedish quality is unverified. Use a multilingual policy in the instructions: default Swedish, switch only when the user clearly speaks another language. Don't force the transcription language.
