# ai-model

Open catalog of AI model data — specs, pricing, and capabilities across providers.

## Install

```bash
npm install ai-model
```

## Usage

```typescript
import { allModels, providers, getModel, getProvider } from "ai-model";

// Get all models
console.log(allModels.length); // 1300+

// Find a specific model
const model = getModel("openai", "gpt-5.4");

// Get a provider
const provider = getProvider("anthropic");
```

## License

MIT
