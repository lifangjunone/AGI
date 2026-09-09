export type AssistantType = 'product' | 'article' | 'social';

export interface AssistantInput {
  type: AssistantType;
  productName?: string;
  audience?: string;
  sellingPoints?: string;
  platform?: string;
  tone?: string;
  topic?: string;
  reader?: string;
  angle?: string;
  scene?: string;
  offer?: string;
  voice?: string;
}

export interface AssistantResult {
  type: AssistantType;
  title: string;
  summary: string;
  items: string[];
  deliverables: string[];
  price: string;
}

export interface AssistantResponse {
  result: AssistantResult;
  payment: {
    status: 'not-integrated' | 'ready';
    amount: string;
    product: string;
  };
}

export interface AssistantRecord extends AssistantResult {
  createdAt: string;
}
