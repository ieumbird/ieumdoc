// Preserve structured evidence before electron-updater 6.8.9 wraps latest-release HTTP errors.
// Selection, metadata parsing, downloads and signatures remain the library's implementation.
import type { OutgoingHttpHeaders } from "node:http";
import { CancellationToken, HttpError, parseXml, type CustomPublishOptions, type GithubOptions } from "builder-util-runtime";
import type { AppUpdater } from "electron-updater";
import semver from "semver";
import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js";
import { NoStableReleaseError, releaseIdentity } from "./update-policy.ts";

export class IeumGitHubProvider extends GitHubProvider {
  private betaOnlyFeed = false;
  private emptyFeed = false;
  private latestAbsent = false;

  constructor(options: CustomPublishOptions, private readonly appUpdater: AppUpdater, runtime: ProviderRuntimeOptions) {
    super({ ...options, provider: "github" } as GithubOptions, appUpdater, runtime);
  }

  override async getLatestVersion(): ReturnType<GitHubProvider["getLatestVersion"]> {
    this.betaOnlyFeed = this.emptyFeed = this.latestAbsent = false;
    // Capture the channel for this request; the controller rejects results after a channel change.
    const stable = !this.appUpdater.allowPrerelease;
    try {
      return await super.getLatestVersion();
    } catch (error) {
      if (stable && (this.emptyFeed || (this.betaOnlyFeed && this.latestAbsent))) throw new NoStableReleaseError();
      throw error;
    }
  }

  protected override async httpRequest(url: URL, headers?: OutgoingHttpHeaders | null, token?: CancellationToken): Promise<string | null> {
    const feed = new URL(`/${this.options.owner}/${this.options.repo}/releases.atom`, this.baseUrl);
    const latest = this.baseUrl.hostname === "github.com"
      ? new URL(`/${this.options.owner}/${this.options.repo}/releases/latest`, this.baseUrl)
      : new URL(this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases/latest`), this.baseApiUrl);
    try {
      const text = await super.httpRequest(url, headers, token);
      if (url.href === feed.href && text !== null) {
        try {
          const xml = parseXml(text);
          if (xml.name === "feed" && xml.attribute("xmlns") === "http://www.w3.org/2005/Atom") {
            const entries = xml.getElements("entry");
            this.emptyFeed = entries.length === 0;
            const tags = entries.map((entry) => {
              const link = new URL(entry.element("link").attribute("href"));
              const prefix = `https://github.com/${this.options.owner}/${this.options.repo}/releases/tag/`;
              if (!link.href.startsWith(prefix)) throw new Error("Release feed links another repository");
              return decodeURIComponent(link.href.slice(prefix.length));
            });
            // GitHub's Atom feed also includes tags with no Release (e.g. archive/* spikes).
            // Like the library's Beta selector, ignore non-semver tags; require a real Beta tag.
            const versions = tags.filter((tag) => semver.valid(tag) !== null);
            this.betaOnlyFeed = versions.length > 0 && versions.every((tag) => releaseIdentity(tag, tag.slice(1)).channel === "beta");
          }
        } catch {
          // The original provider will report an invalid feed; never turn it into absence.
        }
      }
      return text;
    } catch (error) {
      // Public github.com currently returns 406 for JSON /releases/latest with Beta-only releases.
      // A valid repository feed AND this exact endpoint are required; asset/feed 404s stay errors.
      if (url.href === latest.href && error instanceof HttpError &&
          (error.statusCode === 404 || (this.baseUrl.hostname === "github.com" && error.statusCode === 406))) {
        this.latestAbsent = true;
      }
      throw error;
    }
  }
}
