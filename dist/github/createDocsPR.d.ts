import type { CreateDocsPRParams, DocUpdate, SourcePR } from "../types";
export declare function createDocsPR({ octokit, owner, repo, baseBranch, prLabel, sourcePR, updates, }: CreateDocsPRParams): Promise<string>;
export declare function buildPRBody({ sourcePR, updates, }: {
    sourcePR: SourcePR;
    updates: DocUpdate[];
}): string;
//# sourceMappingURL=createDocsPR.d.ts.map