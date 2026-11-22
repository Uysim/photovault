"use client";
import { useParams } from "next/navigation";
import { GalleryView } from "../../gallery-view";

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  // Keyed so moving between albums mounts a fresh view (no previous album's items or rail).
  return <GalleryView key={id} albumId={id} />;
}
