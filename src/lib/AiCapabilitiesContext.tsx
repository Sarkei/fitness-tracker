import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type AiProviderName = 'ollama' | 'mistral' | 'gemini' | 'none';

export interface AiCapabilitiesValue {
  enabled: boolean;
  provider: AiProviderName;
  ollamaConfigured: boolean;
  mistralConfigured: boolean;
  geminiConfigured: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AiCapabilitiesContext = createContext<AiCapabilitiesValue | null>(null);

export function AiCapabilitiesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProviderName>('none');
  const [ollamaConfigured, setOllamaConfigured] = useState(false);
  const [mistralConfigured, setMistralConfigured] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/ai/status');
      const data = (await r.json()) as {
        enabled?: boolean;
        provider?: string;
        ollamaConfigured?: boolean;
        mistralConfigured?: boolean;
        geminiConfigured?: boolean;
      };
      const p =
        data.provider === 'ollama' || data.provider === 'mistral' || data.provider === 'gemini'
          ? data.provider
          : 'none';
      setEnabled(Boolean(data.enabled));
      setProvider(p);
      setOllamaConfigured(Boolean(data.ollamaConfigured));
      setMistralConfigured(Boolean(data.mistralConfigured));
      setGeminiConfigured(Boolean(data.geminiConfigured));
    } catch {
      setEnabled(false);
      setProvider('none');
      setOllamaConfigured(false);
      setMistralConfigured(false);
      setGeminiConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: AiCapabilitiesValue = {
    enabled,
    provider,
    ollamaConfigured,
    mistralConfigured,
    geminiConfigured,
    loading,
    refresh,
  };

  return (
    <AiCapabilitiesContext.Provider value={value}>{children}</AiCapabilitiesContext.Provider>
  );
}

export function useAiCapabilities(): AiCapabilitiesValue {
  const ctx = useContext(AiCapabilitiesContext);
  if (!ctx) {
    throw new Error('useAiCapabilities must be used within AiCapabilitiesProvider');
  }
  return ctx;
}
