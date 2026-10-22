"""Optional WiLoR integration: server-side LBS diagnostic without exposing MANO assets.

Copy this module next to goldar_wilor_api.py together with
wilor_mano_lbs_export.py, then add:

    from goldar_lbs_sidecar import attach_lbs_diagnostics
    ...
    result = attach_lbs_diagnostics(result, state["model"], out, right, camera_t)

inside _infer after its result dict has been assembled, ONLY when
WILOR_LBS_DIAGNOSTICS=1. This helper is not a replacement for tracking
or a public endpoint. It avoids sending licensed MANO rig buffers.
"""
from __future__ import annotations

import os
from typing import Any

from wilor_mano_lbs_export import compare_wilor_camera_vertices


def attach_lbs_diagnostics(
    response: dict[str, Any], wilor_model: Any, inference_output: dict,
    right: float, camera_translation: Any,
) -> dict[str, Any]:
    if os.getenv("WILOR_LBS_DIAGNOSTICS", "0") != "1":
        return response
    hands = response.get("hands")
    if not isinstance(hands, list) or not hands:
        return response
    try:
        metrics = compare_wilor_camera_vertices(
            wilor_model, inference_output, right, camera_translation
        )
        hands[0]["lbsDiagnostics"] = {"available": True, **metrics}
    except (ValueError, TypeError, AttributeError, KeyError) as exc:
        hands[0]["lbsDiagnostics"] = {
            "available": False, "reason": type(exc).__name__
        }
    return response
