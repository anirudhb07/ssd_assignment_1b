# Seeder image: built on mongo:7 so mongosh is available (and its layers are
# shared with the mongo service), plus psql and the Python seeder deps.
FROM mongo:7

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip postgresql-client \
 && rm -rf /var/lib/apt/lists/*

COPY data_generation/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /work
