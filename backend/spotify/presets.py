"""Per-user loop preset persistence."""
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List

from config import PRESETS_FILE


@dataclass
class LoopPreset:
    name: str
    track_uri: str
    track_name: str
    artist: str
    start_ms: int
    end_ms: int
    mode: str = "Forward"


def _load() -> dict:
    if PRESETS_FILE.exists():
        try:
            return json.loads(PRESETS_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save(data: dict) -> None:
    PRESETS_FILE.write_text(json.dumps(data, indent=2))


def list_presets(account_id: str) -> List[LoopPreset]:
    return [LoopPreset(**p) for p in _load().get(account_id, [])]


def add_preset(account_id: str, preset: LoopPreset) -> List[LoopPreset]:
    data = _load()
    presets = [LoopPreset(**p) for p in data.get(account_id, [])]
    presets.append(preset)
    data[account_id] = [asdict(p) for p in presets]
    _save(data)
    return presets


def remove_preset(account_id: str, index: int) -> List[LoopPreset]:
    data = _load()
    presets = [LoopPreset(**p) for p in data.get(account_id, [])]
    if 0 <= index < len(presets):
        presets.pop(index)
        data[account_id] = [asdict(p) for p in presets]
        _save(data)
    return presets


def get_preset(account_id: str, index: int) -> LoopPreset:
    presets = list_presets(account_id)
    if not 0 <= index < len(presets):
        raise IndexError(index)
    return presets[index]