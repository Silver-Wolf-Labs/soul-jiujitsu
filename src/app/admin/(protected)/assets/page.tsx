import AssetBrowser from "@/components/admin/AssetBrowser";

export default function AdminAssetsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-black">Media Library</h1>
        <p className="text-sm text-muted mt-0.5">Upload and manage images used across the site.</p>
      </div>
      <AssetBrowser />
    </div>
  );
}
