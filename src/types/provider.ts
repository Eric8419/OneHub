export interface Model {
  id: string;
  name: string;
}

export interface Provider {
  id: string;
  name: string;
  apiBase: string;
  apiKey: string;
  status: 'connected' | 'configuring' | 'error';
  models: Model[];
}
