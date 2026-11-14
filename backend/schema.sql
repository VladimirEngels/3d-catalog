CREATE TABLE users (
  id serial,
  email varchar(255) NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '_%@_%'),
  password_hash varchar(255) NOT NULL,
  name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
  is_system_admin boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE sessions (
  id serial,
  user_id integer NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (id),
  CHECK (expires_at > created_at)
);

CREATE TABLE teams (
  id serial,
  name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE team_members (
  id serial,
  team_id integer NOT NULL,
  user_id integer NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('viewer', 'member', 'owner')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (team_id, user_id)
);

CREATE TABLE invitations (
  id serial,
  team_id integer NOT NULL,
  invited_by integer NOT NULL,
  email varchar(255) CHECK (email = lower(email) AND email LIKE '_%@_%'),
  token varchar(64) NOT NULL UNIQUE,
  role varchar(20) NOT NULL CHECK (role IN ('viewer', 'member', 'owner')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (id),
  CHECK (expires_at > created_at)
);

CREATE TABLE models (
  id serial,
  team_id integer NOT NULL,
  author_id integer NOT NULL,
  name varchar(200) NOT NULL CHECK (btrim(name) <> ''),
  description text,
  source_url varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE model_versions (
  id serial,
  model_id integer NOT NULL,
  version_number integer NOT NULL CHECK (version_number >= 1),
  comment varchar(500),
  triangles_count integer NOT NULL CHECK (triangles_count >= 0),
  vertices_count integer NOT NULL CHECK (vertices_count >= 0),
  has_skeleton boolean NOT NULL,
  size_x real NOT NULL CHECK (size_x >= 0),
  size_y real NOT NULL CHECK (size_y >= 0),
  size_z real NOT NULL CHECK (size_z >= 0),
  preview_path varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (model_id, version_number)
);

CREATE TABLE files (
  id serial,
  version_id integer,
  job_id integer,
  format varchar(10) NOT NULL CHECK (format IN ('OBJ', 'STL', 'PLY', 'GLTF', 'GLB')),
  file_name varchar(255) NOT NULL CHECK (btrim(file_name) <> ''),
  storage_path varchar(500) NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum varchar(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE NULLS NOT DISTINCT (version_id, job_id, file_name),
  CHECK (num_nonnulls(version_id, job_id) = 1)
);

CREATE TABLE textures (
  id serial,
  version_id integer,
  source_texture_id integer,
  file_name varchar(255) NOT NULL CHECK (btrim(file_name) <> ''),
  storage_path varchar(500) NOT NULL UNIQUE,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  PRIMARY KEY (id),
  CHECK (num_nonnulls(version_id, source_texture_id) = 1)
);

CREATE TABLE materials (
  id serial,
  version_id integer NOT NULL,
  name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
  PRIMARY KEY (id)
);

CREATE TABLE tags (
  id serial,
  team_id integer NOT NULL,
  name varchar(50) NOT NULL CHECK (name = lower(name) AND btrim(name) <> ''),
  PRIMARY KEY (id),
  UNIQUE (team_id, name)
);

CREATE TABLE model_tags (
  id serial,
  model_id integer NOT NULL,
  tag_id integer NOT NULL,
  is_auto boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (model_id, tag_id)
);

CREATE TABLE collections (
  id serial,
  team_id integer NOT NULL,
  name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE collection_models (
  id serial,
  collection_id integer NOT NULL,
  model_id integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (collection_id, model_id)
);

CREATE TABLE conversion_jobs (
  id serial,
  version_id integer NOT NULL,
  created_by integer NOT NULL,
  target_format varchar(10) NOT NULL CHECK (target_format IN ('OBJ', 'GLB', 'STL', 'PLY')),
  upscale_textures boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (id),
  CHECK (status <> 'failed' OR (error_message IS NOT NULL AND btrim(error_message) <> '')),
  CHECK (finished_at >= started_at),
  CHECK (status = 'queued' OR started_at IS NOT NULL),
  CHECK (status NOT IN ('done', 'failed') OR finished_at IS NOT NULL)
);

CREATE TABLE quality_checks (
  id serial,
  job_id integer NOT NULL UNIQUE,
  similarity_percent numeric(5,2) NOT NULL CHECK (similarity_percent BETWEEN 0 AND 100),
  needs_review boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE quality_issues (
  id serial,
  check_id integer NOT NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('loss', 'defect')),
  message varchar(500) NOT NULL CHECK (btrim(message) <> ''),
  PRIMARY KEY (id)
);

CREATE TABLE action_log (
  id serial,
  user_id integer NOT NULL,
  team_id integer,
  action varchar(30) NOT NULL CHECK (action IN ('login', 'create', 'update', 'delete', 'download', 'convert', 'invite')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE sessions ADD FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE team_members ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
ALTER TABLE team_members ADD FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
ALTER TABLE invitations ADD FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE models ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
ALTER TABLE models ADD FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE model_versions ADD FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE;
ALTER TABLE files ADD FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE;
ALTER TABLE files ADD FOREIGN KEY (job_id) REFERENCES conversion_jobs (id) ON DELETE CASCADE;
ALTER TABLE textures ADD FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE;
ALTER TABLE textures ADD FOREIGN KEY (source_texture_id) REFERENCES textures (id) ON DELETE CASCADE;
ALTER TABLE materials ADD FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE;
ALTER TABLE tags ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
ALTER TABLE model_tags ADD FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE;
ALTER TABLE model_tags ADD FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE;
ALTER TABLE collections ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
ALTER TABLE collection_models ADD FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE;
ALTER TABLE collection_models ADD FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE;
ALTER TABLE conversion_jobs ADD FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE;
ALTER TABLE conversion_jobs ADD FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE quality_checks ADD FOREIGN KEY (job_id) REFERENCES conversion_jobs (id) ON DELETE CASCADE;
ALTER TABLE quality_issues ADD FOREIGN KEY (check_id) REFERENCES quality_checks (id) ON DELETE CASCADE;
ALTER TABLE action_log ADD FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE action_log ADD FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;

CREATE INDEX ON sessions (user_id);
CREATE INDEX ON team_members (user_id);
CREATE INDEX ON invitations (team_id);
CREATE INDEX ON invitations (invited_by);
CREATE INDEX ON models (team_id);
CREATE INDEX ON models (author_id);
CREATE INDEX ON files (job_id);
CREATE INDEX ON textures (version_id);
CREATE INDEX ON textures (source_texture_id);
CREATE INDEX ON materials (version_id);
CREATE INDEX ON model_tags (tag_id);
CREATE INDEX ON collections (team_id);
CREATE INDEX ON collection_models (model_id);
CREATE INDEX ON conversion_jobs (version_id);
CREATE INDEX ON conversion_jobs (created_by);
CREATE INDEX ON quality_issues (check_id);
CREATE INDEX ON action_log (user_id);
CREATE INDEX ON action_log (team_id);
CREATE INDEX ON files (checksum);
CREATE INDEX ON conversion_jobs (status);
