"""
Scenario creator routes for testing disaster scenarios
"""

from flask import Blueprint, render_template

scenario_bp = Blueprint('scenario', __name__, url_prefix='/test/scenario')

@scenario_bp.route('', methods=['GET'])
def scenario_creator_page():
    """Render the scenario creator page"""
    return render_template('scenario_creator.html')

