PY := ./venv/bin/python

.PHONY: install migrate api worker relay reaper web test chaos verify seed clean

install:
	python3.11 -m venv venv
	./venv/bin/pip install -q -r requirements.txt
	cd web && npm install

migrate:
	$(PY) manage.py migrate

api:
	$(PY) manage.py runserver 8000

worker:
	$(PY) manage.py runworker

relay:
	$(PY) manage.py runrelay

reaper:
	$(PY) manage.py runreaper

web:
	cd web && npm run dev

seed:
	$(PY) manage.py seed_demo --count 20

test:
	$(PY) -m pytest

chaos:
	KEEL_RETRY_BASE=0.4 KEEL_RETRY_MAX=6 $(PY) manage.py chaos \
		--runs 60 --workers 4 --duration 120 \
		--kill-every 4 --freeze-every 5 --lease 6 --latency-ms 250

verify:
	$(PY) manage.py verify --require-published

clean:
	rm -rf var .pytest_cache web/.next
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
