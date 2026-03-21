# modelpedia

Open catalog of AI model data — specs, pricing, and capabilities across providers.

## Install

```bash
npm install modelpedia
```

## Usage

```typescript
import { allModels, providers, getModel, getProvider } from "modelpedia";

// Get all models
console.log(allModels.length); // 2000+

// Find a specific model
const model = getModel("openai", "gpt-5.4");

// Get a provider
const provider = getProvider("anthropic");
```

## License

MIT
