import ExpoModulesCore
import UIKit
import Vision

public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("extractText") { (uri: String, preferArabic: Bool) -> [String] in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      let data = try Data(contentsOf: url)
      guard let image = UIImage(data: data), let cgImage = image.cgImage else {
        throw Exception(name: "ReadFailed", description: "Could not read the receipt photo")
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        request.recognitionLanguages = preferArabic ? ["ar-SA", "en-US"] : ["en-US", "ar-SA"]
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      try handler.perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
  }
}
