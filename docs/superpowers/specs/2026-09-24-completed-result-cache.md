# Completed result reuse

The selected option is B: reuse confirmed results for the same draw across page visits and readers. A new draw or an edit to the existing draw/analysis must invalidate the shared copy. Preserve current permission checks, payment processing, homepage retry cadence and output format. Do not cache authenticated detail or incomplete/failed responses across members.

The public homepage has two independent reads: Railway's latest completed result and the Supabase Matrix Status summary. The existing database draw revisions and worker generations track committed edits. A cheap service-only revision check on each request is acceptable to prevent stale results; the existing full reads are skipped when the revision is unchanged. Calendar eligibility must continue to be resolved per request because its manual overrides are independent of draw revisions.

If the revision check is unavailable, use the original read path. Cache data only within a service process/Edge isolate; separate instances may each need one initial load.
