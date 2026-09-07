import pytest
from app.domain.tiangong_algorithm import is_valid_sorted_prediction, _parse_request

@pytest.mark.parametrize('maximum,count', [(39,5),(49,6)])
def test_all_prediction_positions_match_sorted_bounds(maximum,count):
    for number in range(1,maximum+1):
        for position in range(1,count+1):
            assert is_valid_sorted_prediction(number,position,maximum,count) == (position <= number <= maximum-count+position)
    if count==6:
        for number in range(1,50):
            assert is_valid_sorted_prediction(number,7,49,6)

@pytest.mark.parametrize('lottery,numbers,expected', [
    ('今彩539',[39,1,20,3,5],[1,3,5,20,39]),
    ('天天樂',[39,1,20,3,5],[1,3,5,20,39]),
    ('六合彩',[49,2,30,4,20,6,1],[2,4,6,20,30,49,1]),
    ('大樂透',[49,2,30,4,20,6,1],[2,4,6,20,30,49,1]),
])
def test_core_uses_sorted_main_numbers_and_preserves_special(lottery,numbers,expected):
    request=_parse_request(dict(lottery=lottery,source_window=50,target_period='120',
        draws=[dict(period=str(i),numbers=numbers) for i in range(74)],
        source_position_patterns=['固定'],stage1_position_patterns=['固定'],
        stage2_position_patterns=['固定'],stage1_route_types=['加減'],stage2_route_types=['合值']))
    assert list(request.draws[0].numbers)==expected

@pytest.mark.parametrize('first,second,label',[('add_sub','add_sub','加減版路'),('sum','sum','合值版路'),('add_sub','sum','加減合值'),('sum','add_sub','合值加減')])
def test_ordered_road_labels(first,second,label):
    from app.domain.tiangong_algorithm import Rule,_route_label
    assert _route_label(Rule(first,1),Rule(second,2))==label
