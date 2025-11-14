# ApiLocationsPost400Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**message** | **str** |  | [optional] 
**status** | **str** |  | [optional] 

## Example

```python
from nexum-api-client.models.api_locations_post400_response import ApiLocationsPost400Response

# TODO update the JSON string below
json = "{}"
# create an instance of ApiLocationsPost400Response from a JSON string
api_locations_post400_response_instance = ApiLocationsPost400Response.from_json(json)
# print the JSON string representation of the object
print ApiLocationsPost400Response.to_json()

# convert the object into a dict
api_locations_post400_response_dict = api_locations_post400_response_instance.to_dict()
# create an instance of ApiLocationsPost400Response from a dict
api_locations_post400_response_form_dict = api_locations_post400_response.from_dict(api_locations_post400_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


