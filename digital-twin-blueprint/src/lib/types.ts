export type Twin = {
  id: string;
  ownerName: string;
  title: string;
  status: "draft" | "testing" | "published";
  modes: Array<"text" | "voice" | "video">;
  scores: {
    knowledgeAccuracy: number;
    styleSimilarity: number;
    boundarySafety: number;
    publishReadiness: number;
  };
};

export type PersonaProfile = {
  identityStatement: string;
  tone: string[];
  values: string[];
  boundaries: string[];
  expressionSamples: string[];
  fallbackPolicy: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  type: "article" | "pdf" | "tweet" | "podcast" | "video" | "note" | "faq";
  permission: "public" | "summary_only" | "private_memory" | "blocked";
  status: "queued" | "processing" | "ready" | "needs_review";
  topics: string[];
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "visitor" | "twin" | "system";
  content: string;
  sourceIds?: string[];
  risk?: "none" | "sensitive" | "blocked";
};

export type Correction = {
  messageId: string;
  label:
    | "accurate_and_like_me"
    | "accurate_but_not_like_me"
    | "wrong"
    | "should_not_answer";
  rewrite?: string;
};

export type ConversationSample = {
  id: string;
  question: string;
  answer: string;
  risk: ChatMessage["risk"];
  sourceIds?: string[];
};
