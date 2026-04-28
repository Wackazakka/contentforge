export type CampaignStatus = "draft" | "processing" | "completed" | "failed";

export type Campaign = {
  id: string;
  name: string;
  productName: string;
  headline: string;
  bodyCopy: string;
  cta: string;
  tone: "energetic" | "calm" | "friendly" | "professional";
  service: "reforhandle" | "singlepicker" | "custom";
  voiceover: boolean;
  music: boolean;
  musicStyle: "upbeat" | "minimal" | "cinematic";
  status: CampaignStatus;
  formats: string[];
  createdAt: string;
};

// Demo campaigns baked in for MVP
export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "demo-1",
    name: "Reforhandle Vår 2026",
    productName: "Reforhandle",
    headline: "Spar tusenvis på strøm og internett",
    bodyCopy: "Vi forhandler abonnementene dine — du betaler bare for resultater.",
    cta: "Start gratis",
    tone: "friendly",
    service: "reforhandle",
    voiceover: true,
    music: true,
    musicStyle: "upbeat",
    status: "completed",
    formats: ["16:9", "9:16", "1:1"],
    createdAt: "2026-04-20T10:00:00Z",
  },
  {
    id: "demo-2",
    name: "SinglePicker Lanseringsuke",
    productName: "SinglePicker",
    headline: "Finn din neste favorittartist",
    bodyCopy: "AI-drevet musikk­oppdagelse for singlekjøpere og plateselskaper.",
    cta: "Prøv nå",
    tone: "energetic",
    service: "singlepicker",
    voiceover: false,
    music: true,
    musicStyle: "cinematic",
    status: "processing",
    formats: ["9:16", "1:1"],
    createdAt: "2026-04-25T14:30:00Z",
  },
];

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Utkast",
  processing: "Produserer...",
  completed: "Fullført",
  failed: "Feil",
};

export const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: "text-gray-600 bg-gray-100",
  processing: "text-yellow-700 bg-yellow-100",
  completed: "text-green-700 bg-green-100",
  failed: "text-red-700 bg-red-100",
};
