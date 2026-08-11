import os

from flask import Flask

import db
from blueprints.admin import admin_bp
from blueprints.auth import auth_bp
from blueprints.forum import forum_bp
from blueprints.hub import hub_bp
from blueprints.profile import profile_bp

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

app.register_blueprint(admin_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(forum_bp)
app.register_blueprint(hub_bp)
app.register_blueprint(profile_bp)


@app.route('/health')
def health():
    """健康檢查端點，回傳 200 OK。"""
    return 'OK', 200


if __name__ == '__main__':
    db.init_db()
    app.run(host='0.0.0.0', port=4000, debug=True)
