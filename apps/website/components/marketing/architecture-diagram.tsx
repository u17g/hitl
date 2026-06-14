export function ArchitectureDiagram() {
  return (
    <div className="parallel-card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
        .well-known/hitl/v1
      </div>
      <div className="bg-zinc-950 p-6 font-mono text-xs leading-relaxed text-zinc-400 dark:bg-black/40 md:text-sm">
        <div className="space-y-4">
          <div>
            <span className="text-blue-400">Workflow</span>
            <span className="text-zinc-500"> → suspend on hook</span>
          </div>
          <div className="ml-3 border-l border-dashed border-zinc-700 pl-4 text-zinc-500">
            POST /.well-known/hitl/v1/requests
          </div>
          <div>
            <span className="text-emerald-400">Hitl server</span>
            <span className="text-zinc-500"> → record + deliver</span>
          </div>
          <div className="ml-3 border-l border-dashed border-zinc-700 pl-4 text-zinc-500">
            adapter.send → Slack / Teams / Discord / inbox
          </div>
          <div>
            <span className="text-violet-400">Reviewer</span>
            <span className="text-zinc-500"> → approve / deny</span>
          </div>
          <div className="ml-3 border-l border-dashed border-zinc-700 pl-4 text-zinc-500">
            hitl.inbox.approve → resumeHook(token)
          </div>
          <div>
            <span className="text-blue-400">Workflow</span>
            <span className="text-zinc-500"> → resumes with HumanResult</span>
          </div>
        </div>
      </div>
    </div>
  );
}
