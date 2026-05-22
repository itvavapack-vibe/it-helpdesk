-- GLPI expand_dropdowns returns model names (e.g. 'P8H61-M LE R2.0'), not numeric IDs
USE helpdsk_db;

ALTER TABLE assets
  MODIFY COLUMN computermodels_id VARCHAR(255) NULL;
