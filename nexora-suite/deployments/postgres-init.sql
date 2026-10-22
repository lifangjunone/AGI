CREATE DATABASE nexora_core;
CREATE DATABASE nexora_studio;
CREATE DATABASE nexora_control;
CREATE DATABASE nexora_maas;

\connect nexora_core
\i /migrations/core/001_init.sql

\connect nexora_studio
\i /migrations/studio/001_init.sql

\connect nexora_control
\i /migrations/control/001_init.sql

\connect nexora_maas
\i /migrations/maas/001_init.sql
