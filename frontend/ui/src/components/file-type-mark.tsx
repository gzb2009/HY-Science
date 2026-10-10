import csv from "../assets/file-icons/csv.png"
import docx from "../assets/file-icons/docx.png"
import html from "../assets/file-icons/html.png"
import jpg from "../assets/file-icons/jpg.png"
import json from "../assets/file-icons/json.png"
import md from "../assets/file-icons/md.png"
import pdf from "../assets/file-icons/pdf.png"
import png from "../assets/file-icons/png.png"
import pptx from "../assets/file-icons/pptx.png"
import py from "../assets/file-icons/py.png"
import svg from "../assets/file-icons/svg.png"
import txt from "../assets/file-icons/txt.png"
import xlsx from "../assets/file-icons/xlsx.png"

const ICONS: Record<string, string> = {
  md,
  markdown: md,
  doc: docx,
  docx,
  xls: xlsx,
  xlsx,
  csv,
  tsv: csv,
  pdf,
  png,
  jpg,
  jpeg: jpg,
  gif: png,
  webp: png,
  tif: png,
  tiff: png,
  svg,
  ppt: pptx,
  pptx,
  json,
  py,
  pyx: py,
  ipynb: py,
  txt,
  text: txt,
  log: txt,
  html,
  htm: html,
}

export function fileTypeIcon(name: string) {
  const dot = name.lastIndexOf(".")
  const ext = (dot > 0 ? name.slice(dot + 1) : "").toLowerCase()
  return ICONS[ext] ?? txt
}

export function fileTypeLabel(name: string) {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"))
  const file = slash >= 0 ? name.slice(slash + 1) : name
  const dot = file.lastIndexOf(".")
  const stem = dot > 0 ? file.slice(0, dot) : file
  if (stem.length <= 16) return stem
  return stem.replaceAll(/[_-]/g, (mark) => `${mark}\u200b`)
}

export function FileTypeCard(props: { name: string }) {
  return (
    <div data-slot="session-turn-file-type">
      <img data-slot="session-turn-file-type-icon" src={fileTypeIcon(props.name)} alt="" />
      <span data-slot="session-turn-file-type-name">{fileTypeLabel(props.name)}</span>
    </div>
  )
}
