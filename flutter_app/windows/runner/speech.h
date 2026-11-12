#ifndef RUNNER_SPEECH_H_
#define RUNNER_SPEECH_H_

#include <windows.h>
#include <sapi.h>

#include <flutter/binary_messenger.h>
#include <flutter/encodable_value.h>
#include <flutter/method_channel.h>

#include <memory>

// LISTEN (lib/features/write/listen.dart): a chapter read aloud with Windows' own speech (SAPI), over the channel
// "novel_builder/speech": "available" -> bool; "speak" {text, rate} -> an id, with "done"(id) sent back once it has
// been said; "stop" -> silence. The text is spoken and nothing else: not kept, sent or changed.
class Speech {
 public:
  // The window message SAPI sends when something it was saying ends.
  static constexpr UINT kMessage = WM_APP + 0x42;

  Speech(flutter::BinaryMessenger* messenger, HWND window);
  ~Speech();

  // Called by the window for kMessage.
  void OnMessage();

 private:
  bool Ready();

  HWND window_;
  ISpVoice* voice_ = nullptr;
  std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>> channel_;
};

#endif  // RUNNER_SPEECH_H_
