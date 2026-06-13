export function ArchitectureDiagram() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card p-6 font-mono text-xs leading-relaxed text-muted-foreground md:text-sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
            Workflow
          </span>
          <span>→ suspend on hook</span>
        </div>
        <div className="ml-4 border-l-2 border-dashed pl-4">
          POST /.well-known/hitl/v1/requests
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400">
            Hitl server
          </span>
          <span>→ record + deliver</span>
        </div>
        <div className="ml-4 border-l-2 border-dashed pl-4">
          adapter.send → Slack / Teams / Discord / inbox
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-500/10 px-2 py-0.5 text-purple-600 dark:text-purple-400">
            Reviewer
          </span>
          <span>→ approve / deny</span>
        </div>
        <div className="ml-4 border-l-2 border-dashed pl-4">
          hitl.inbox.approve → resumeHook(token)
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
            Workflow
          </span>
          <span>→ resumes with HumanResult</span>
        </div>
      </div>
    </div>
  );
}
