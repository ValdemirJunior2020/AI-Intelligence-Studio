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
# Model directly imports flash_attention, which upstream asserts is present.
# Append an SDPA implementation only when neither FlashAttention backend exists.
attention_file=root/"wan"/"modules"/"attention.py"
if not attention_file.is_file():
    raise SystemExit("Wan attention.py missing; cannot install AMD fallback.")
attention_text=attention_file.read_text(encoding="utf-8")
if "# THEUX_AMD_SDPA_FALLBACK_V1" not in attention_text:
    backup=attention_file.with_name(attention_file.name+".theux-original")
    if not backup.exists():
        shutil.copy2(attention_file,backup)
        print(f"Backup: {backup}")
    attention_file.write_text(attention_text+"\n\n"+"# THEUX_AMD_SDPA_FALLBACK_V1\n# Native PyTorch scaled-dot-product attention for one GPU, no flash_attn wheels.\nif not FLASH_ATTN_2_AVAILABLE and not FLASH_ATTN_3_AVAILABLE:\n    import torch.nn.functional as F\n\n    def flash_attention(q, k, v, q_lens=None, k_lens=None, dropout_p=0.0,\n                        softmax_scale=None, q_scale=None, causal=False,\n                        window_size=(-1, -1), deterministic=False,\n                        dtype=torch.bfloat16, version=None):\n        original_dtype = q.dtype\n        if q_scale is not None:\n            q = q * q_scale\n        q = q.transpose(1, 2).to(dtype)\n        k = k.transpose(1, 2).to(dtype)\n        v = v.transpose(1, 2).to(dtype)\n        lq, lk = q.size(-2), k.size(-2)\n        mask = None\n        if q_lens is not None or k_lens is not None or window_size != (-1, -1):\n            query_positions = torch.arange(lq, device=q.device)[:, None]\n            key_positions = torch.arange(lk, device=q.device)[None, :]\n            allowed = torch.ones((q.size(0), 1, lq, lk), dtype=torch.bool, device=q.device)\n            if q_lens is not None:\n                allowed &= query_positions[None, None] < torch.as_tensor(q_lens, device=q.device).view(-1, 1, 1, 1)\n            if k_lens is not None:\n                allowed &= key_positions[None, None] < torch.as_tensor(k_lens, device=q.device).view(-1, 1, 1, 1)\n            left, right = window_size\n            if left >= 0:\n                allowed &= key_positions[None, None] >= query_positions[None, None] - left\n            if right >= 0:\n                allowed &= key_positions[None, None] <= query_positions[None, None] + right\n            if causal:\n                allowed &= key_positions[None, None] <= query_positions[None, None]\n                causal = False\n            mask = allowed\n        out = F.scaled_dot_product_attention(q, k, v, attn_mask=mask,\n                                              dropout_p=dropout_p,\n                                              is_causal=causal, scale=softmax_scale)\n        return out.transpose(1, 2).contiguous().to(original_dtype)\n"+"\n",encoding="utf-8")
    print(f"Installed AMD PyTorch SDPA fallback: {attention_file}")
else:
    print(f"AMD SDPA fallback already installed: {attention_file}")
print("Single-GPU compatibility fixes applied. GPU inference is still unverified.")
