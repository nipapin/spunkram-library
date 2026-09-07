import type { ReactNode } from "react";

export type GalScriptId =
  | "project-sorter"
  | "renamer"
  | "reduce-project"
  | "handy-collect"
  | "wiggler";

export type GalScriptIcon =
  | "folder"
  | "text"
  | "trash"
  | "download"
  | "route";

export type GalScriptDef = {
  id: GalScriptId;
  name: string;
  description: string;
  hosts: Array<"PPRO" | "AEFT">;
  color: string;
  icon: GalScriptIcon;
  info: string;
  /** One-click pipeline (no form). */
  pipeline?: boolean;
};

export const GAL_SCRIPTS: GalScriptDef[] = [
  {
    id: "project-sorter",
    name: "Project Sorter",
    description: "Sort project panel items into typed bins",
    hosts: ["PPRO", "AEFT"],
    color: "#5EABD6",
    icon: "folder",
    info: "Creates Sequences, Video, Audio, Images, Graphics, Offline, and Other folders and categorizes all project elements by item type.\nFiles from the Gal Toolkit MAX and Gal Stock folders remain in their original locations.",
  },
  {
    id: "renamer",
    name: "Renamer",
    description: "Rename selected items or clips",
    hosts: ["PPRO", "AEFT"],
    color: "#d0a31e",
    icon: "text",
    info: "Renames selected elements in the Project panel or selected clips in the timeline.\n\nRename in - specifies where the renaming will occur.\n\nNumberable - adds a counter (works in the order of selection).\n\nReplace - renames a specific part of the name.",
  },
  {
    id: "reduce-project",
    name: "Reduce Project",
    description: "Keep only media used by selected sequences",
    hosts: ["PPRO"],
    color: "#40bf79",
    icon: "trash",
    info: "Removes all elements from the project that do not belong to the selected sequences.",
    pipeline: true,
  },
  {
    id: "handy-collect",
    name: "Handy Collect",
    description: "Collect project media into a folder",
    hosts: ["PPRO"],
    color: "#A19AD3",
    icon: "download",
    info: "Creates a copy of your project at the specified path, preserving all elements used in it alongside the copy.\nSequence is selected - all elements not related to it are deleted.\nNo sequence is selected - the entire project is copied",
    pipeline: true,
  },
  {
    id: "wiggler",
    name: "Wiggler",
    description: "Apply wiggle expressions to selected properties",
    hosts: ["AEFT"],
    color: "#40bf79",
    icon: "route",
    info: "Wiggles selected properties of selected elements.\n\nWiggle type - specifies the type of wiggle.\n\nWiggle amount - specifies the amount of wiggle.\n\nWiggle speed - specifies the speed of the wiggle.\n\nWiggle direction - specifies the direction of the wiggle.",
  },
];

export function scriptsForHost(host: "PPRO" | "AEFT" | null): GalScriptDef[] {
  if (!host) return GAL_SCRIPTS;
  return GAL_SCRIPTS.filter((s) => s.hosts.includes(host));
}

export type ScriptTone = "info" | "success" | "warning" | "error";

export type ScriptMessage = {
  tone: ScriptTone;
  text: string;
};

export type ScriptFormProps = {
  onMessage: (msg: ScriptMessage) => void;
  subscribed: boolean;
};

export type ScriptFormRender = (props: ScriptFormProps) => ReactNode;
