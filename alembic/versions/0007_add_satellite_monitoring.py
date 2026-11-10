"""add satellite observations and field boundary storage

Revision ID: 0007_add_satellite_monitoring
Revises: 0006_add_irrigation_module
Create Date: 2026-11-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_add_satellite_monitoring"
down_revision: Union[str, Sequence[str], None] = "0006_add_irrigation_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("irrigation_fields", sa.Column("boundary_geojson", sa.JSON(), nullable=True))
    op.create_table(
        "satellite_observations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("acquisition_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("cloud_coverage_percent", sa.Float(), nullable=True),
        sa.Column("spatial_resolution_m", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("statistics", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["field_id"], ["irrigation_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_satellite_observations_field_id", "satellite_observations", ["field_id"])
    op.create_index("ix_satellite_observations_user_id", "satellite_observations", ["user_id"])
    op.create_index(
        "ix_satellite_observations_acquisition_date",
        "satellite_observations",
        ["acquisition_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_satellite_observations_acquisition_date", table_name="satellite_observations")
    op.drop_index("ix_satellite_observations_user_id", table_name="satellite_observations")
    op.drop_index("ix_satellite_observations_field_id", table_name="satellite_observations")
    op.drop_table("satellite_observations")
    op.drop_column("irrigation_fields", "boundary_geojson")
