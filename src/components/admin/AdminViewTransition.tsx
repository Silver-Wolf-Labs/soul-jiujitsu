"use client";

/**
 * Wrap the return of pages that use a `view` state (list/edit) to get
 * the same fade-slide animation as route-based page transitions.
 *
 * Usage:
 *   <AdminViewTransition viewKey={view}>
 *     {view === "edit" ? <EditForm /> : <ListView />}
 *   </AdminViewTransition>
 */
export default function AdminViewTransition({
  viewKey,
  children,
}: {
  viewKey: string;
  children: React.ReactNode;
}) {
  return (
    <div key={viewKey} className="animate-admin-page-in">
      {children}
    </div>
  );
}
