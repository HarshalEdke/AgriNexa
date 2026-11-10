from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.irrigation import CropWaterParameter


@dataclass(frozen=True)
class CropWaterProfile:
    kc: float
    depletion_fraction: float
    source: str


async def resolve_crop_water_profile(
    db: AsyncSession,
    crop_name: str,
    growth_stage: str,
    kc_override: float | None = None,
) -> CropWaterProfile:
    result = await db.execute(
        select(CropWaterParameter).where(CropWaterParameter.crop_name == crop_name.strip().lower())
    )
    parameter = result.scalar_one_or_none()
    if parameter is None:
        if kc_override is not None:
            return CropWaterProfile(kc=kc_override, depletion_fraction=0.5, source="farmer_input")
        raise ValueError(f"No reference Kc is available for {crop_name}; provide the crop coefficient manually.")

    if kc_override is not None:
        return CropWaterProfile(
            kc=kc_override,
            depletion_fraction=parameter.depletion_fraction,
            source="farmer_input",
        )

    stage = growth_stage.strip().lower()
    if any(term in stage for term in ("initial", "establishment", "early")):
        kc = parameter.kc_initial
    elif any(term in stage for term in ("late", "maturity", "harvest", "end")):
        kc = parameter.kc_end
    else:
        kc = parameter.kc_mid
    return CropWaterProfile(kc=kc, depletion_fraction=parameter.depletion_fraction, source="generic_fao_reference")
