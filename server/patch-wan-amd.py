"""Single-GPU Windows ROCm compatibility patch for Wan2.1 T2V.
Backs up original upstream files once and never touches PyTorch itself.
Only bypasses optional multi-GPU FSDP imports; does not fake missing GPU ops.
"""
import argparse
from pathlib import Path
import shutil

parser=argparse.ArgumentParser()
parser.add_argument("--wan-root",required=True)
args=parser.parse_args()
root=Path(args.wan_root).resolve()
fsdp=root/"wan"/"distributed"/"fsdp.py"
entry=root/"wan"/"__init__.py"
if not fsdp.is_file() or not entry.is_file():
    raise SystemExit("Wan source files missing; cannot apply single-GPU patch.")

marker="# THEUX_WIN_AMD_SINGLE_GPU_PATCH_V1"
replacement=marker+"""
import gc
import torch

def shard_model(*args, **kwargs):
    raise RuntimeError("FSDP is not supported by Windows ROCm. Use one GPU without --t5_fsdp or --dit_fsdp.")

def free_model(model):
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
"""
entry_text=marker+"""
from . import configs, modules
from .text2video import WanT2V
"""
for file,content in [(fsdp,replacement),(entry,entry_text)]:
    original=file.read_text(encoding="utf-8")
    if original.startswith(marker):
        print(f"Already patched: {file}")
        continue
    backup=file.with_name(file.name+".theux-original")
    if not backup.exists():
        shutil.copy2(file,backup)
        print(f"Backup: {backup}")
    file.write_text(content,encoding="utf-8")
    print(f"Single GPU workaround: {file}")
# Windows ROCm wheels may omit the entire torch.distributed backend.
# On single-GPU runs there is no initialized process group.
for relative in ["generate.py", "wan/text2video.py"]:
    target=root/relative
    source=target.read_text(encoding="utf-8")
    old="dist.is_initialized()"
    new='getattr(dist, "is_initialized", lambda: False)()'
    if old in source:
        backup=target.with_name(target.name+".theux-original")
        if not backup.exists():
            shutil.copy2(target,backup)
            print(f"Backup: {backup}")
        target.write_text(source.replace(old,new),encoding="utf-8")
        print(f"Patched single-GPU distributed check: {target}")
print("Single-GPU compatibility fixes applied. GPU inference is still unverified.")
