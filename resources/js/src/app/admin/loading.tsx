import { Loader2 } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  );
}
