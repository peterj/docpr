import type { GitHub } from "@actions/github/lib/utils";
import type Anthropic from "@anthropic-ai/sdk";
export type Octokit = InstanceType<typeof GitHub>;
export interface DocFile {
    path: string;
    sha: string;
}
export interface DocFileWithContent extends DocFile {
    content: string;
}
export interface DocUpdate {
    path: string;
    content: string;
    originalSha: string;
    reason: string;
}
export interface SourcePR {
    number: number;
    title: string;
    url: string;
    repo: string;
}
export interface GetPRDiffParams {
    octokit: Octokit;
    owner: string;
    repo: string;
    prNumber: number;
}
export interface GetDocFilesParams {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch: string;
    basePath: string;
    maxFiles: number;
}
export interface CreateDocsPRParams {
    octokit: Octokit;
    owner: string;
    repo: string;
    baseBranch: string;
    prLabel: string;
    sourcePR: SourcePR;
    updates: DocUpdate[];
}
export interface AnalyzePRChangesParams {
    anthropic: Anthropic;
    model: string;
    prTitle: string;
    prBody: string;
    diff: string;
}
export interface IdentifyRelevantDocsParams {
    anthropic: Anthropic;
    model: string;
    changeAnalysis: string;
    docFilePaths: string[];
}
export interface GenerateDocUpdatesParams {
    anthropic: Anthropic;
    model: string;
    prTitle: string;
    prBody: string;
    prUrl: string;
    changeAnalysis: string;
    relevantDocs: DocFileWithContent[];
}
