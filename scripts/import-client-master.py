"""Import the cleaned List Klien workbook into Supabase client_master.

Run only after the two client_master migrations have been applied. The import
uses stable workbook row keys, so rerunning it updates rows instead of cloning
them.
"""

import os
import sys
from pathlib import Path
from urllib import request
import json

import pandas as pd


def load_local_env():
    env_file = Path(__file__).resolve().parents[1] / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def value(row, column):
    item = row.get(column)
    if pd.isna(item):
        return None
    return item


def number(row, column):
    item = value(row, column)
    return float(item) if item is not None else None


def year_value(row, column):
    item = value(row, column)
    if item is None or str(item).strip() in {"~", "CANCEL"}:
        return None
    try:
        return int(float(item))
    except (TypeError, ValueError):
        return None


def clean_text(item):
    return str(item).strip() if item is not None else None


def main():
    load_local_env()
    workbook = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("List Klien.xlsx")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Supabase environment variables are missing.")
    if not workbook.exists():
        raise SystemExit(f"Workbook not found: {workbook}")

    frame = pd.read_excel(workbook)
    rows = []
    for index, row in frame.iterrows():
        name = clean_text(value(row, "NAMA KLIEN"))
        if not name:
            continue
        source_status = clean_text(value(row, "STATUS")) or "UNKNOWN"
        normalized_status = "Inactive" if "SELESAI" in source_status else "Active" if "KONTRAK" in source_status else "Proposal"
        rows.append({
            "client_code": f"LIST-KLIEN-SHEET1-ROW-{index + 2}",
            "legal_name": name,
            "npwp": None,
            "industry": None,
            "address": None,
            "status": normalized_status,
            "source_status": source_status,
            "source_system": "List Klien.xlsx",
            "source_row_key": f"Sheet1!{index + 2}",
            "difficulties": int(number(row, "DIFFICULTIES")) if number(row, "DIFFICULTIES") is not None else None,
            "kpp": clean_text(value(row, "KPP")),
            "contract_type": source_status,
            "dpp": number(row, "DPP"),
            "ppn_amount": number(row, "PPN"),
            "pph23_amount": number(row, "PPH 23"),
            "invoice_amount": number(row, "NILAI INVOICE"),
            "annual_fee_percentage": number(row, "% FEE TAHUNAN"),
            "annual_fee": number(row, "FEE TAHUNAN"),
            # The workbook contains years only, so do not invent month/day values.
            "engagement_start_year": year_value(row, "START KONTRAK"),
            "engagement_end_year": year_value(row, "STOP KONTRAK"),
            "previous_tax_pic_name": clean_text(value(row, "PIC PAJAK LAMA")),
            "previous_accounting_pic_name": clean_text(value(row, "PIC LAPORAN LAMA")),
            "next_tax_pic_name": clean_text(value(row, "PIC PAJAK BARU")),
            "next_accounting_pic_name": clean_text(value(row, "PIC LAPORAN BARU")),
        })

    endpoint = url.rstrip("/") + "/rest/v1/client_master?on_conflict=client_code"
    payload = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = request.Request(endpoint, data=payload, method="POST", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    with request.urlopen(req, timeout=60) as response:
        if response.status not in (200, 201, 204):
            raise SystemExit(f"Supabase returned HTTP {response.status}")
    print(f"Imported or updated {len(rows)} client rows.")


if __name__ == "__main__":
    main()
