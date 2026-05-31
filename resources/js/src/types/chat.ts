export type MediaAttachment = {
  type: "video" | "image" | "pdf" | "map";
  url: string;
  title?: string;
  thumbnail?: string;
};

export type Message = {
  id: string;
  role: "user" | "james";
  content: string;
  media?: MediaAttachment[];
  topic?: string;
  timestamp: number;
  pending?: boolean;
};
