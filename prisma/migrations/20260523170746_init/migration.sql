-- CreateTable
CREATE TABLE "pythias" (
    "name_hash" BYTEA NOT NULL,
    "name" TEXT NOT NULL,
    "owner_address" TEXT NOT NULL,
    "daemon_address" TEXT NOT NULL,
    "vault_address" TEXT,
    "manifest_hash" BYTEA NOT NULL,
    "manifest_irys_id" TEXT,
    "mandate_root" BYTEA NOT NULL,
    "mandate_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bond_floor" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "bond_balance" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "stake_principal" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "total_shares" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "accrued_owner_fees" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "last_forecast_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delisted" BOOLEAN NOT NULL DEFAULT false,
    "delisted_reason" INTEGER,
    "agora_rank" DECIMAL(65,30) DEFAULT 0,
    "brier_30d" DECIMAL(65,30),
    "profile_image_url" TEXT,
    "description" TEXT,
    "circle_wallet_id" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "pythias_pkey" PRIMARY KEY ("name_hash")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "market_id" BYTEA NOT NULL,
    "prob_scaled" DECIMAL(78,0) NOT NULL,
    "trace_hash" BYTEA NOT NULL,
    "trace_irys_id" TEXT,
    "block_number" BIGINT NOT NULL,
    "block_time" TIMESTAMP(3) NOT NULL,
    "tx_hash" BYTEA NOT NULL,
    "position_id" BIGINT,
    "market_resolved" BOOLEAN NOT NULL DEFAULT false,
    "market_outcome_yes" BOOLEAN,
    "brier_contribution" DECIMAL(65,30),
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakes" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "user_address" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quote_amount" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "shares" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "block_number" BIGINT NOT NULL,
    "block_time" TIMESTAMP(3) NOT NULL,
    "tx_hash" BYTEA NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "stakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "vault_position_id" BIGINT NOT NULL,
    "market_id" BYTEA NOT NULL,
    "yes" BOOLEAN NOT NULL,
    "quote_amount" DECIMAL(78,0) NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "returned_amount" DECIMAL(78,0),
    "pnl" DECIMAL(78,0),
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "builder_fees" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" BYTEA NOT NULL,

    CONSTRAINT "builder_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slashings" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "slash_type" INTEGER NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "block_number" BIGINT NOT NULL,
    "block_time" TIMESTAMP(3) NOT NULL,
    "tx_hash" BYTEA NOT NULL,

    CONSTRAINT "slashings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "market_id" BYTEA NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "expires_at" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "outcome_yes" BOOLEAN,
    "resolved_at" TIMESTAMP(3),
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "markets_pkey" PRIMARY KEY ("market_id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "name_hash" BYTEA NOT NULL,
    "trace_hash" BYTEA NOT NULL,
    "submitter_address" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "validator_verdict" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "bond_share_to_submitter" DECIMAL(78,0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traction_events" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name_hash" BYTEA,
    "actor" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "pushed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_cursor" (
    "name" TEXT NOT NULL,
    "block" BIGINT NOT NULL,

    CONSTRAINT "indexer_cursor_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "pythias_name_key" ON "pythias"("name");

-- CreateIndex
CREATE INDEX "pythias_owner_address_idx" ON "pythias"("owner_address");

-- CreateIndex
CREATE INDEX "pythias_delisted_idx" ON "pythias"("delisted");

-- CreateIndex
CREATE INDEX "pythias_agora_rank_idx" ON "pythias"("agora_rank" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "forecasts_trace_hash_key" ON "forecasts"("trace_hash");

-- CreateIndex
CREATE INDEX "forecasts_name_hash_block_time_idx" ON "forecasts"("name_hash", "block_time" DESC);

-- CreateIndex
CREATE INDEX "forecasts_market_id_idx" ON "forecasts"("market_id");

-- CreateIndex
CREATE INDEX "stakes_name_hash_block_time_idx" ON "stakes"("name_hash", "block_time" DESC);

-- CreateIndex
CREATE INDEX "stakes_user_address_idx" ON "stakes"("user_address");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_hash_vault_position_id_key" ON "positions"("name_hash", "vault_position_id");

-- CreateIndex
CREATE INDEX "slashings_name_hash_block_time_idx" ON "slashings"("name_hash", "block_time" DESC);

-- CreateIndex
CREATE INDEX "traction_events_kind_created_at_idx" ON "traction_events"("kind", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakes" ADD CONSTRAINT "stakes_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builder_fees" ADD CONSTRAINT "builder_fees_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slashings" ADD CONSTRAINT "slashings_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traction_events" ADD CONSTRAINT "traction_events_name_hash_fkey" FOREIGN KEY ("name_hash") REFERENCES "pythias"("name_hash") ON DELETE SET NULL ON UPDATE CASCADE;
