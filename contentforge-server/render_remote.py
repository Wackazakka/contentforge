#!/usr/bin/env python3
"""Asset-transport for ekstern render (skalering steg 3, Lars 11/8).

Den fjerne containeren ser ikke dropletens disk. Renderen leser ~100 MB lokale
filer per jobb (klipp, bilder, musikk) via ABSOLUTTE stier i config.json og
skriver output lokalt. Dette modulet flytter det settet gjennom R2:

  package  (paa dropleten)  — les config.json, last config + alle input-filer
                              opp til R2 under render-jobs/<jobId>/<absolutt-sti>.
  run      (i containeren)  — last config + input ned til SAMME absolutte stier,
                              kjor make_tiktok uendret, last output opp til R2.

Nokkelen: hver fil lagres i R2 paa nokkelen render-jobs/<jobId>/ + stien uten
ledende «/». Da rekonstrueres path-treet bit-likt inne i containeren, og
render-skriptet trenger INGEN endring — det leser fortsatt /root/...-stiene.

Renderen selv trenger KUN R2-nokler, ikke OpenAI/ElevenLabs/fal — de kjorer
upstream paa dropleten for render.
"""
import json
import os
import subprocess
import sys

import boto3

SCRIPT_PATH = os.environ.get(
    "RENDER_SCRIPT", "/root/.openclaw/workspace/reforhandle-content/make_tiktok_reforhandle.py"
)
# I containeren ligger skriptet paa /app; paa dropleten paa reforhandle-content.
if not os.path.exists(SCRIPT_PATH) and os.path.exists("/app/make_tiktok_reforhandle.py"):
    SCRIPT_PATH = "/app/make_tiktok_reforhandle.py"

PREFIX = "render-jobs"


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def bucket():
    return os.environ.get("R2_BUCKET_NAME") or os.environ["R2_BUCKET"]


def abs_paths(cfg):
    """Alle absolutte /root-stier i config, i innsettingsrekkefolge, uten dubletter."""
    out, seen = [], set()

    def walk(v):
        if isinstance(v, str) and v.startswith("/root/") and v not in seen:
            seen.add(v)
            out.append(v)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)

    walk(cfg)
    return out


def job_id_from(cfg):
    # Jobbmappa er dirnavnet paa output-stien: .../contentforge-output/<jobId>/output.mp4
    return os.path.basename(os.path.dirname(cfg["output"]))


def key_for(job_id, abs_path):
    return f"{PREFIX}/{job_id}/{abs_path.lstrip('/')}"


def package(config_path):
    cfg = json.load(open(config_path, encoding="utf-8"))
    job_id = job_id_from(cfg)
    s3, b = s3_client(), bucket()
    output = cfg["output"]

    # config selv
    s3.upload_file(config_path, b, f"{PREFIX}/{job_id}/config.json")
    n = 1
    for p in abs_paths(cfg):
        if p == output:
            continue  # output SKRIVES av renderen, lastes ikke opp som input
        if not os.path.exists(p):
            print(f"  ADVARSEL: input mangler lokalt, hopper over: {p}", flush=True)
            continue
        s3.upload_file(p, b, key_for(job_id, p))
        n += 1
    print(f"pakket jobb {job_id}: {n} filer -> r2://{b}/{PREFIX}/{job_id}/", flush=True)
    return job_id


def run(job_id):
    s3, b = s3_client(), bucket()

    # config forst
    os.makedirs("/tmp", exist_ok=True)
    local_cfg = "/tmp/config.json"
    s3.download_file(b, f"{PREFIX}/{job_id}/config.json", local_cfg)
    cfg = json.load(open(local_cfg, encoding="utf-8"))
    output = cfg["output"]

    # hver input ned til SIN absolutte sti
    for p in abs_paths(cfg):
        if p == output:
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        s3.download_file(b, key_for(job_id, p), p)
    print(f"lastet ned input for {job_id}", flush=True)

    # render UENDRET — den leser /root-stiene som ligger paa plass naa
    os.makedirs(os.path.dirname(output), exist_ok=True)
    subprocess.run(["python3", SCRIPT_PATH, local_cfg], check=True)

    # output (+ done-markor) opp
    s3.upload_file(output, b, key_for(job_id, output))
    done = output + ".done"
    if os.path.exists(done):
        s3.upload_file(done, b, key_for(job_id, done))
    print(f"lastet opp output for {job_id}: r2://{b}/{key_for(job_id, output)}", flush=True)


def main():
    if len(sys.argv) < 2:
        print("bruk: render_remote.py package <config.json> | run <jobId>", file=sys.stderr)
        sys.exit(2)
    mode = sys.argv[1]
    if mode == "package":
        package(sys.argv[2])
    elif mode == "run":
        run(sys.argv[2])
    else:
        print(f"ukjent modus: {mode}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
