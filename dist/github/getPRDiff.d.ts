import type { GetPRDiffParams } from "../types";
export declare function getPRDiff({ octokit, owner, repo, prNumber, }: GetPRDiffParams): Promise<string>;
export declare function truncateDiff(diff: string, maxChars?: number): string;
//# sourceMappingURL=getPRDiff.d.ts.map