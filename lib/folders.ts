import { formatBytes } from "@/lib/format";

export type FolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    files: number;
    children: number;
  };
};

export type FolderSizeGroup = {
  folderId: string | null;
  _sum: {
    size: number | null;
  };
};

export type FolderPathItem = {
  id: string;
  name: string;
};

export type SerializedFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  fileCount: number;
  childCount: number;
  size: number;
  sizeFormatted: string;
  totalFileCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  depth: number;
  path: FolderPathItem[];
};

export function serializeFoldersForClient(folders: FolderRecord[], sizeGroups: FolderSizeGroup[]) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map<string | null, FolderRecord[]>();
  const sizesByFolder = new Map(sizeGroups.map((group) => [group.folderId, group._sum.size ?? 0]));
  const totalsByFolder = new Map<string, { totalFileCount: number; totalSize: number }>();

  for (const folder of folders) {
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(folder.parentId, siblings);
  }

  function getTotals(folder: FolderRecord): { totalFileCount: number; totalSize: number } {
    const cached = totalsByFolder.get(folder.id);

    if (cached) {
      return cached;
    }

    const children = childrenByParent.get(folder.id) ?? [];
    const childTotals = children.reduce(
      (total, child) => {
        const next = getTotals(child);

        return {
          totalFileCount: total.totalFileCount + next.totalFileCount,
          totalSize: total.totalSize + next.totalSize,
        };
      },
      { totalFileCount: 0, totalSize: 0 },
    );
    const totals = {
      totalFileCount: folder._count.files + childTotals.totalFileCount,
      totalSize: (sizesByFolder.get(folder.id) ?? 0) + childTotals.totalSize,
    };

    totalsByFolder.set(folder.id, totals);

    return totals;
  }

  function getPath(folder: FolderRecord): FolderPathItem[] {
    const path: FolderPathItem[] = [];
    const seen = new Set<string>();
    let current: FolderRecord | undefined = folder;

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift({ id: current.id, name: current.name });
      current = current.parentId ? foldersById.get(current.parentId) : undefined;
    }

    return path;
  }

  return folders
    .map((folder) => {
      const size = sizesByFolder.get(folder.id) ?? 0;
      const totals = getTotals(folder);
      const path = getPath(folder);

      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        fileCount: folder._count.files,
        childCount: folder._count.children,
        size,
        sizeFormatted: formatBytes(size),
        totalFileCount: totals.totalFileCount,
        totalSize: totals.totalSize,
        totalSizeFormatted: formatBytes(totals.totalSize),
        depth: Math.max(0, path.length - 1),
        path,
      };
    })
    .sort((left, right) => {
      const leftPath = left.path.map((item) => item.name.toLocaleLowerCase()).join("/");
      const rightPath = right.path.map((item) => item.name.toLocaleLowerCase()).join("/");

      return leftPath.localeCompare(rightPath);
    });
}
