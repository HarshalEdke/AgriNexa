from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.irrigation import IrrigationField, IrrigationHistory
from app.irrigation_schemas import IrrigationHistoryCreate


class IrrigationHistoryService:
    @staticmethod
    async def record(
        db: AsyncSession,
        user_id: int,
        field: IrrigationField,
        request: IrrigationHistoryCreate,
    ) -> IrrigationHistory:
        history = IrrigationHistory(
            field_id=field.id,
            user_id=user_id,
            irrigated_at=request.irrigated_at,
            water_used_litres=request.water_used_litres,
            duration_minutes=request.duration_minutes,
            method=request.method or field.irrigation_method,
            notes=request.notes,
        )
        field.last_irrigation_at = request.irrigated_at
        db.add(history)
        await db.flush()
        return history
