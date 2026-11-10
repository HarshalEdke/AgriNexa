"""add irrigation monitoring and recommendation tables

Revision ID: 0006_add_irrigation_module
Revises: 0005_remove_email_verification
Create Date: 2026-11-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_irrigation_module"
down_revision: Union[str, Sequence[str], None] = "0005_remove_email_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "irrigation_fields",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("field_name", sa.String(length=120), nullable=False),
        sa.Column("crop_name", sa.String(length=100), nullable=False),
        sa.Column("crop_variety", sa.String(length=100), nullable=True),
        sa.Column("growth_stage", sa.String(length=60), nullable=False),
        sa.Column("sowing_date", sa.Date(), nullable=True),
        sa.Column("crop_duration_days", sa.Integer(), nullable=True),
        sa.Column("root_depth_m", sa.Float(), nullable=False),
        sa.Column("kc", sa.Float(), nullable=False),
        sa.Column("kc_source", sa.String(length=40), nullable=False),
        sa.Column("soil_type", sa.String(length=20), nullable=False),
        sa.Column("soil_moisture_percent", sa.Float(), nullable=True),
        sa.Column("moisture_source", sa.String(length=20), nullable=True),
        sa.Column("moisture_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("field_capacity_percent", sa.Float(), nullable=False),
        sa.Column("permanent_wilting_point_percent", sa.Float(), nullable=False),
        sa.Column("soil_water_holding_capacity_mm_per_m", sa.Float(), nullable=True),
        sa.Column("location", sa.String(length=160), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("area_hectares", sa.Float(), nullable=False),
        sa.Column("irrigation_method", sa.String(length=30), nullable=False),
        sa.Column("irrigation_efficiency", sa.Float(), nullable=False),
        sa.Column("flow_rate_lpm", sa.Float(), nullable=True),
        sa.Column("water_source", sa.String(length=120), nullable=True),
        sa.Column("last_irrigation_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_irrigation_fields_user_id", "irrigation_fields", ["user_id"])

    op.create_table(
        "soil_moisture_readings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("soil_moisture_percent", sa.Float(), nullable=False),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("humidity_percent", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("device_id", sa.String(length=120), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_soil_moisture_readings_field_id", "soil_moisture_readings", ["field_id"])

    op.create_table(
        "irrigation_recommendations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("recommended_date", sa.Date(), nullable=True),
        sa.Column("recommended_time", sa.String(length=20), nullable=True),
        sa.Column("net_requirement_mm", sa.Float(), nullable=True),
        sa.Column("gross_requirement_mm", sa.Float(), nullable=True),
        sa.Column("required_water_litres", sa.Float(), nullable=True),
        sa.Column("estimated_duration_minutes", sa.Float(), nullable=True),
        sa.Column("recommended_method", sa.String(length=30), nullable=False),
        sa.Column("irrigation_efficiency", sa.Float(), nullable=False),
        sa.Column("et0_mm_day", sa.Float(), nullable=True),
        sa.Column("etc_mm_day", sa.Float(), nullable=True),
        sa.Column("effective_rainfall_mm", sa.Float(), nullable=False),
        sa.Column("soil_depletion_mm", sa.Float(), nullable=True),
        sa.Column("readily_available_water_mm", sa.Float(), nullable=True),
        sa.Column("estimated_water_saved_litres", sa.Float(), nullable=False),
        sa.Column("weather_source", sa.String(length=30), nullable=False),
        sa.Column("calculation_basis", sa.String(length=80), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("alerts", sa.JSON(), nullable=False),
        sa.Column("calculation_data", sa.JSON(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_irrigation_recommendations_field_id", "irrigation_recommendations", ["field_id"])
    op.create_index("ix_irrigation_recommendations_user_id", "irrigation_recommendations", ["user_id"])

    op.create_table(
        "irrigation_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("recommendation_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("planned_water_litres", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recommendation_id"], ["irrigation_recommendations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_irrigation_schedules_field_id", "irrigation_schedules", ["field_id"])
    op.create_index("ix_irrigation_schedules_user_id", "irrigation_schedules", ["user_id"])

    op.create_table(
        "irrigation_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("irrigated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("water_used_litres", sa.Float(), nullable=False),
        sa.Column("duration_minutes", sa.Float(), nullable=True),
        sa.Column("method", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_irrigation_history_field_id", "irrigation_history", ["field_id"])
    op.create_index("ix_irrigation_history_user_id", "irrigation_history", ["user_id"])

    op.create_table(
        "weather_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("current_data", sa.JSON(), nullable=False),
        sa.Column("forecast_data", sa.JSON(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weather_records_field_id", "weather_records", ["field_id"])
    op.create_index("ix_weather_records_user_id", "weather_records", ["user_id"])

    op.create_table(
        "crop_water_parameters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("crop_name", sa.String(length=100), nullable=False),
        sa.Column("kc_initial", sa.Float(), nullable=False),
        sa.Column("kc_mid", sa.Float(), nullable=False),
        sa.Column("kc_end", sa.Float(), nullable=False),
        sa.Column("depletion_fraction", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crop_water_parameters_crop_name", "crop_water_parameters", ["crop_name"], unique=True)

    crop_parameters = sa.table(
        "crop_water_parameters",
        sa.column("crop_name", sa.String),
        sa.column("kc_initial", sa.Float),
        sa.column("kc_mid", sa.Float),
        sa.column("kc_end", sa.Float),
        sa.column("depletion_fraction", sa.Float),
        sa.column("source", sa.String),
    )
    op.bulk_insert(
        crop_parameters,
        [
            {"crop_name": "wheat", "kc_initial": 0.30, "kc_mid": 1.15, "kc_end": 0.25, "depletion_fraction": 0.55, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "maize", "kc_initial": 0.30, "kc_mid": 1.20, "kc_end": 0.35, "depletion_fraction": 0.55, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "rice", "kc_initial": 1.05, "kc_mid": 1.20, "kc_end": 0.90, "depletion_fraction": 0.20, "source": "Generic FAO-56 planning coefficient; paddy water balance not modeled"},
            {"crop_name": "tomato", "kc_initial": 0.60, "kc_mid": 1.15, "kc_end": 0.80, "depletion_fraction": 0.40, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "cotton", "kc_initial": 0.35, "kc_mid": 1.15, "kc_end": 0.70, "depletion_fraction": 0.65, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "potato", "kc_initial": 0.50, "kc_mid": 1.15, "kc_end": 0.75, "depletion_fraction": 0.35, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "sugarcane", "kc_initial": 0.40, "kc_mid": 1.25, "kc_end": 0.75, "depletion_fraction": 0.65, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "soybean", "kc_initial": 0.40, "kc_mid": 1.15, "kc_end": 0.50, "depletion_fraction": 0.50, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
            {"crop_name": "chickpea", "kc_initial": 0.40, "kc_mid": 1.00, "kc_end": 0.35, "depletion_fraction": 0.50, "source": "Generic FAO-56 planning coefficient; local calibration advised"},
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_crop_water_parameters_crop_name", table_name="crop_water_parameters")
    op.drop_table("crop_water_parameters")
    op.drop_index("ix_weather_records_user_id", table_name="weather_records")
    op.drop_index("ix_weather_records_field_id", table_name="weather_records")
    op.drop_table("weather_records")
    op.drop_index("ix_irrigation_history_user_id", table_name="irrigation_history")
    op.drop_index("ix_irrigation_history_field_id", table_name="irrigation_history")
    op.drop_table("irrigation_history")
    op.drop_index("ix_irrigation_schedules_user_id", table_name="irrigation_schedules")
    op.drop_index("ix_irrigation_schedules_field_id", table_name="irrigation_schedules")
    op.drop_table("irrigation_schedules")
    op.drop_index("ix_irrigation_recommendations_user_id", table_name="irrigation_recommendations")
    op.drop_index("ix_irrigation_recommendations_field_id", table_name="irrigation_recommendations")
    op.drop_table("irrigation_recommendations")
    op.drop_index("ix_soil_moisture_readings_field_id", table_name="soil_moisture_readings")
    op.drop_table("soil_moisture_readings")
    op.drop_index("ix_irrigation_fields_user_id", table_name="irrigation_fields")
    op.drop_table("irrigation_fields")
