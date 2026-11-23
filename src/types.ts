export type Platform = "windows" | "linux" | "macos";
export type PricingModel = "free-open-source" | "freeware";

export interface CatalogApp {
  id: string;
  name: string;
  publisher: string;
  description: string;
  categories: string[];
  platforms: Platform[];
  pricingModel: PricingModel;
  links: {
    website: string;
    download: string;
    sourceCode?: string;
  };
}

export interface CustomShortcut {
  id: string;
  name: string;
  target: string;
  kind: "url" | "path";
}
