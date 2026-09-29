import {
  MapDocument,
  ModelRules,
  Resolver,
  Validator,
} from "./builder-model.js?v=2.3.0";
self.onmessage = ({ data }) => {
  try {
    const doc = ModelRules.normalizeDocument(new MapDocument(data));
    Resolver.resolve(doc);
    self.postMessage({ issues: Validator.validate(doc, true) });
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  }
};
