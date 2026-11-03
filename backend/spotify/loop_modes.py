"""Loop mode implementations.

Each mode receives the current loop state on every engine tick and returns
an action: a seek target, a direction change, and/or a pause request.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class LoopState:
    loop_start_ms: Optional[int] = None
    loop_end_ms: Optional[int] = None
    progress_ms: int = 0
    direction: int = 1          # 1 = forward, -1 = backward
    is_playing: bool = True
    is_enabled: bool = False


@dataclass
class LoopAction:
    seek_to_ms: Optional[int] = None
    new_direction: Optional[int] = None
    should_pause: bool = False


class LoopMode(ABC):
    """Abstract base class for loop behaviors."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        pass

    @abstractmethod
    def update(self, state: LoopState) -> LoopAction:
        pass

    def on_loop_start_set(self, position_ms: int) -> None:
        pass

    def on_loop_end_set(self, position_ms: int) -> None:
        pass

    def on_loop_cleared(self) -> None:
        pass


class ForwardLoopMode(LoopMode):
    """Standard forward loop: A -> B -> jump back to A -> repeat."""

    @property
    def name(self) -> str:
        return "Forward"

    @property
    def description(self) -> str:
        return "Jump from B back to A and repeat"

    def update(self, state: LoopState) -> LoopAction:
        if state.loop_start_ms is None or state.loop_end_ms is None:
            return LoopAction()
        if state.progress_ms >= state.loop_end_ms:
            return LoopAction(seek_to_ms=state.loop_start_ms)
        return LoopAction()


class PingPongLoopMode(LoopMode):
    """Ping-pong loop: A -> B -> reverse -> A -> forward -> repeat."""

    @property
    def name(self) -> str:
        return "Ping-Pong"

    @property
    def description(self) -> str:
        return "Reverse direction at A and B boundaries"

    def update(self, state: LoopState) -> LoopAction:
        if state.loop_start_ms is None or state.loop_end_ms is None:
            return LoopAction()
        if not state.is_playing:
            return LoopAction()
        if state.direction == 1 and state.progress_ms >= state.loop_end_ms:
            return LoopAction(seek_to_ms=state.loop_start_ms, new_direction=-1)
        if state.direction == -1 and state.progress_ms <= state.loop_start_ms:
            return LoopAction(seek_to_ms=state.loop_end_ms, new_direction=1)
        return LoopAction()


class CrossfadeLoopMode(LoopMode):
    """Crossfade loop: seek early to allow overlap/fade transition.

    Triggers a seek to loop_start_ms when approaching loop_end_ms minus OVERLAP_MS.
    """

    OVERLAP_MS = 1500

    @property
    def name(self) -> str:
        return "Crossfade"

    @property
    def description(self) -> str:
        return "Seamless overlap jump from B back to A"

    def update(self, state: LoopState) -> LoopAction:
        if state.loop_start_ms is None or state.loop_end_ms is None:
            return LoopAction()
        if not state.is_playing:
            return LoopAction()
        trigger_ms = max(state.loop_start_ms, state.loop_end_ms - self.OVERLAP_MS)
        if state.progress_ms >= trigger_ms:
            return LoopAction(seek_to_ms=state.loop_start_ms)
        return LoopAction()


BUILTIN_MODES = {
    "Forward": ForwardLoopMode(),
    "Ping-Pong": PingPongLoopMode(),
    "Crossfade": CrossfadeLoopMode(),
}


def get_mode(name: str) -> Optional[LoopMode]:
    return BUILTIN_MODES.get(name)


def mode_names() -> list:
    return list(BUILTIN_MODES.keys())