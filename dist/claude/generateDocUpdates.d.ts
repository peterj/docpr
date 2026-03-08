import type { GenerateDocUpdatesParams, DocUpdate } from "../types";
export declare function generateDocUpdates({ anthropic, model, prTitle, prBody, prUrl, changeAnalysis, relevantDocs, }: GenerateDocUpdatesParams): Promise<DocUpdate[]>;
export declare function stripCodeFence(text: string, filePath: string): string;
//# sourceMappingURL=generateDocUpdates.d.ts.map