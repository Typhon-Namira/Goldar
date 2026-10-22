"""Export a validated MANO LBS payload from an already loaded MANO model.

This module does NOT start WiLoR, load licensed MANO assets or change its API.
Call from the WiLoR inference process after obtaining the same model and pose
that produced the frame. All positions stay in native MANO model coordinates;
camera conversion must be performed separately and explicitly.
"""
from __future__ import annotations

import numpy as np


def _numpy(value):
    if hasattr(value, "detach"):
        value = value.detach().cpu()
    if hasattr(value, "toarray"):
        value = value.toarray()
    return np.asarray(value, dtype=np.float64)


def _vec3_array(value, count, name):
    result = _numpy(value)
    if result.shape != (count, 3) or not np.isfinite(result).all():
        raise ValueError(f"{name}: expected finite ({count}, 3), got {result.shape}")
    return result


def _rotation_array(value):
    result = _numpy(value)
    if result.shape != (16, 3, 3) or not np.isfinite(result).all():
        raise ValueError("Expected 16 MANO local rotation matrices")
    for rotation in result:
        if not np.allclose(rotation.T @ rotation, np.eye(3), atol=0.02):
            raise ValueError("Nonorthogonal MANO rotation")
        if abs(np.linalg.det(rotation) - 1) > 0.02:
            raise ValueError("Invalid MANO rotation determinant")
    return result


def _parent_indices(kintree):
    table = _numpy(kintree).astype(np.int64)
    if table.shape != (2, 16):
        raise ValueError("MANO kintree_table must be (2,16)")
    # SMPL/MANO kintree stores node IDs in row 1 and parent IDs in row 0.
    ids = {int(node): index for index, node in enumerate(table[1])}
    parents = [-1]
    for i in range(1, 16):
        parent_id = int(table[0, i])
        if parent_id not in ids or ids[parent_id] >= i:
            raise ValueError("MANO skeleton must be topologically sorted")
        parents.append(ids[parent_id])
    return parents


def export_mano_lbs(model, betas, local_rotations):
    """Build the frontend ManoRig + ManoPose inputs from matching MANO data.

    model must expose v_template, shapedirs, posedirs, J_regressor,
    kintree_table and lbs_weights (or weights). All are from ONE hand side
    and ONE licensed MANO model version.

    betas: 10 shape coefficients.
    local_rotations: (16,3,3) local MANO rotations, root first.
    Root translation is intentionally zero: caller must supply a separate
    model-to-camera transform, not silently treat WiLoR camera translation
    as MANO-space translation.
    """
    template = _vec3_array(model.v_template, 778, "v_template")
    beta = _numpy(betas).reshape(-1)
    if beta.shape != (10,) or not np.isfinite(beta).all():
        raise ValueError("Expected 10 finite MANO betas")
    rotations = _rotation_array(local_rotations)

    shapedirs = _numpy(model.shapedirs)
    if shapedirs.shape != (778, 3, 10):
        raise ValueError(f"Unexpected MANO shapedirs {shapedirs.shape}")
    shape_offsets = np.einsum("vci,i->vc", shapedirs, beta)
    shaped_vertices = template + shape_offsets

    regressor = _numpy(model.J_regressor)
    if regressor.shape != (16, 778):
        raise ValueError(f"Unexpected MANO J_regressor {regressor.shape}")
    joints = regressor @ shaped_vertices

    posedirs = _numpy(model.posedirs)
    # smplx stores posedirs as (135, 2334); some model loaders expose
    # the equivalent (778,3,135) tensor.
    if posedirs.shape == (778, 3, 135):
        posedirs = posedirs.reshape(2334, 135).T
    if posedirs.shape != (135, 2334):
        raise ValueError(f"Unexpected MANO posedirs {posedirs.shape}")
    feature = (rotations[1:] - np.eye(3)).reshape(135)
    pose_offsets = (feature @ posedirs).reshape(778, 3)

    weights = _numpy(getattr(model, "lbs_weights", None)
                     if getattr(model, "lbs_weights", None) is not None
                     else model.weights)
    if weights.shape != (778, 16) or not np.isfinite(weights).all():
        raise ValueError("Invalid MANO LBS weights")
    if (weights < -1e-7).any() or not np.allclose(weights.sum(axis=1), 1, atol=0.02):
        raise ValueError("MANO weights must be nonnegative and normalized")

    return {
        "schemaVersion": 1,
        "coordinateSystem": "mano_model",
        "units": "meters",
        "rig": {
            "templateVertices": template.tolist(),
            "shapeOffsets": shape_offsets.tolist(),
            "poseOffsets": pose_offsets.tolist(),
            "restJoints": joints.tolist(),
            "parents": _parent_indices(model.kintree_table),
            "weights": weights.tolist(),
        },
        "pose": {
            "localPose": rotations.tolist(),
            "rootTranslation": [0.0, 0.0, 0.0],
        },
        "requiresModelToCameraTransform": True,
    }


def extract_wilor_local_rotations(out):
    """Extract a 16-joint rotation stack without inventing a pose convention.

    The WiLoR payload's globalOrient and handPose may be matrices or
    flattened matrices depending on the installed model version. This
    adapter only accepts verified 3x3 matrices. It does not silently
    reinterpret axis-angle vectors as rotations.
    """
    if "pred_mano_params" not in out:
        raise ValueError("WiLoR output missing pred_mano_params")
    params = out["pred_mano_params"]
    global_orient = _numpy(params["global_orient"]).reshape(-1, 3, 3)
    hand_pose = _numpy(params["hand_pose"]).reshape(-1, 3, 3)
    if global_orient.shape != (1, 3, 3) or hand_pose.shape != (15, 3, 3):
        raise ValueError("WiLoR MANO pose must contain 1+15 rotation matrices")
    return _rotation_array(np.concatenate([global_orient, hand_pose], axis=0))


def export_wilor_frame_lbs(model, out):
    """Build optional MANO payload for one WiLoR output.

    IMPORTANT: `model` is the actual MANO layer, NOT the WiLoR network.
    The caller must verify the correct left/right model, units and
    coordinate transforms. Do not call this with an unverified model.
    """
    params = out.get("pred_mano_params")
    if params is None or "betas" not in params:
        raise ValueError("WiLoR output missing MANO betas")
    betas = _numpy(params["betas"]).reshape(-1)
    rotations = extract_wilor_local_rotations(out)
    return export_mano_lbs(model, betas, rotations)
