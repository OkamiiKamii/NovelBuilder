#include "speech.h"

#include <flutter/standard_method_codec.h>

#include <cmath>
#include <string>

namespace {

std::wstring Wide(const std::string& utf8) {
  if (utf8.empty()) return std::wstring();
  const int n = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  std::wstring out(n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), n);
  return out;
}

const flutter::EncodableValue* Field(const flutter::EncodableMap& map, const char* key) {
  auto it = map.find(flutter::EncodableValue(std::string(key)));
  return it == map.end() ? nullptr : &it->second;
}

}  // namespace

Speech::Speech(flutter::BinaryMessenger* messenger, HWND window) : window_(window) {
  channel_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      messenger, "novel_builder/speech", &flutter::StandardMethodCodec::GetInstance());
  channel_->SetMethodCallHandler([this](const flutter::MethodCall<flutter::EncodableValue>& call,
                                        std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
    const std::string& method = call.method_name();
    if (method == "available") {
      result->Success(flutter::EncodableValue(Ready()));
    } else if (method == "speak") {
      std::string text;
      double rate = 1.0;
      if (const auto* args = std::get_if<flutter::EncodableMap>(call.arguments())) {
        if (const auto* t = Field(*args, "text")) {
          if (const auto* s = std::get_if<std::string>(t)) text = *s;
        }
        if (const auto* r = Field(*args, "rate")) {
          if (const auto* d = std::get_if<double>(r)) rate = *d;
        }
      }
      if (!Ready()) {
        result->Success();
        return;
      }
      // SAPI's rate runs from -10 to 10, 0 the voice's own; about 10 steps to double or halve it.
      long steps = static_cast<long>(std::lround(10.0 * std::log2(rate > 0.1 ? rate : 0.1)));
      voice_->SetRate(steps < -10 ? -10 : (steps > 10 ? 10 : steps));
      ULONG stream = 0;
      const std::wstring wide = Wide(text);
      const HRESULT hr = voice_->Speak(wide.c_str(), SPF_ASYNC | SPF_PURGEBEFORESPEAK | SPF_IS_NOT_XML, &stream);
      if (FAILED(hr)) {
        result->Success();
        return;
      }
      result->Success(flutter::EncodableValue("w-" + std::to_string(stream)));
    } else if (method == "stop") {
      if (voice_) voice_->Speak(nullptr, SPF_ASYNC | SPF_PURGEBEFORESPEAK, nullptr);
      result->Success();
    } else {
      result->NotImplemented();
    }
  });
}

Speech::~Speech() {
  if (channel_) channel_->SetMethodCallHandler(nullptr);
  if (voice_) {
    voice_->Speak(nullptr, SPF_PURGEBEFORESPEAK, nullptr);
    voice_->Release();
    voice_ = nullptr;
  }
}

bool Speech::Ready() {
  if (voice_) return true;
  if (FAILED(CoCreateInstance(CLSID_SpVoice, nullptr, CLSCTX_ALL, IID_ISpVoice, reinterpret_cast<void**>(&voice_)))) {
    voice_ = nullptr;
    return false;
  }
  const ULONGLONG ends = SPFEI(SPEI_END_INPUT_STREAM);
  voice_->SetInterest(ends, ends);
  voice_->SetNotifyWindowMessage(window_, kMessage, 0, 0);
  return true;
}

void Speech::OnMessage() {
  if (!voice_) return;
  SPEVENT event;
  ULONG fetched = 0;
  while (voice_->GetEvents(1, &event, &fetched) == S_OK && fetched == 1) {
    if (event.eEventId == SPEI_END_INPUT_STREAM) {
      channel_->InvokeMethod("done",
                             std::make_unique<flutter::EncodableValue>("w-" + std::to_string(event.ulStreamNum)));
    }
    // Events that carry a string or an object own it: let it go.
    if (event.elParamType == SPET_LPARAM_IS_STRING || event.elParamType == SPET_LPARAM_IS_POINTER) {
      CoTaskMemFree(reinterpret_cast<void*>(event.lParam));
    } else if (event.elParamType == SPET_LPARAM_IS_OBJECT || event.elParamType == SPET_LPARAM_IS_TOKEN) {
      reinterpret_cast<IUnknown*>(event.lParam)->Release();
    }
  }
}
